import {
  type ModeSwitchMarker,
  type SchedulerJob,
  type SimulationEvent,
  type SystemMode,
  type TaskModel,
  type TimelineSegment,
  resolvePriority,
  sampleExecutionBudget,
} from "./TaskModel";

export interface EngineSnapshot {
  time: number;
  mode: SystemMode;
  runningTaskName: string | null;
  activeTaskCount: number;
  deadlineMissCount: number;
  events: SimulationEvent[];
  segments: TimelineSegment[];
  modeSwitches: ModeSwitchMarker[];
}

interface EngineState {
  time: number;
  mode: SystemMode;
  nextJobId: number;
  runningTaskName: string | null;
  deadlineMissCount: number;
  readyJobs: SchedulerJob[];
  events: SimulationEvent[];
  segments: TimelineSegment[];
  modeSwitches: ModeSwitchMarker[];
}

const MAX_EVENT_HISTORY = 400;
const MAX_SEGMENT_HISTORY = 1800;
const MAX_MODE_SWITCH_HISTORY = 400;

export class SchedulerEngine {
  private state: EngineState;

  constructor() {
    this.state = {
      time: 0,
      mode: "LO",
      nextJobId: 0,
      runningTaskName: null,
      deadlineMissCount: 0,
      readyJobs: [],
      events: [],
      segments: [],
      modeSwitches: [],
    };
  }

  getSnapshot(): EngineSnapshot {
    return {
      time: this.state.time,
      mode: this.state.mode,
      runningTaskName: this.state.runningTaskName,
      activeTaskCount: this.state.readyJobs.length,
      deadlineMissCount: this.state.deadlineMissCount,
      events: [...this.state.events],
      segments: [...this.state.segments],
      modeSwitches: [...this.state.modeSwitches],
    };
  }

  reset() {
    this.state = {
      time: 0,
      mode: "LO",
      nextJobId: 0,
      runningTaskName: null,
      deadlineMissCount: 0,
      readyJobs: [],
      events: [],
      segments: [],
      modeSwitches: [],
    };
  }

  step(tasks: TaskModel[], tickMs: number): EngineSnapshot {
    const safeTick = Math.max(1, tickMs);
    const currentTime = this.state.time;

    this.releaseJobs(tasks, currentTime);
    this.detectDeadlineMisses(currentTime);

    const selected = this.selectReadyJob();

    if (!selected) {
      this.state.runningTaskName = null;
      this.state.time += safeTick;
      return this.getSnapshot();
    }

    this.state.runningTaskName = selected.taskName;
    selected.executedTime += safeTick;
    selected.remainingTime -= safeTick;

    this.pushSegment({
      taskId: selected.taskId,
      taskName: selected.taskName,
      criticality: selected.criticality,
      start: currentTime,
      end: currentTime + safeTick,
      mode: this.state.mode,
    });

    const exceededLoBudget =
      this.state.mode === "LO" &&
      selected.criticality === "HI" &&
      selected.executedTime > selected.wcetLo;

    if (exceededLoBudget) {
      this.triggerModeSwitch(currentTime + safeTick);
    }

    if (selected.remainingTime <= 0) {
      this.state.readyJobs = this.state.readyJobs.filter(
        (job) => job.id !== selected.id,
      );
      this.pushEvent(
        currentTime + safeTick,
        `${selected.taskName} completed`,
        "completion",
      );
    }

    this.state.time += safeTick;
    return this.getSnapshot();
  }

  private releaseJobs(tasks: TaskModel[], time: number) {
    for (const task of tasks) {
      if (this.state.mode === "HI" && task.criticality === "LO") {
        continue;
      }

      if (time % task.period !== 0) {
        continue;
      }

      const budget = sampleExecutionBudget(task);
      const job: SchedulerJob = {
        id: `job-${this.state.nextJobId++}`,
        taskId: task.id,
        taskName: task.name,
        criticality: task.criticality,
        releaseTime: time,
        absoluteDeadline: time + task.deadline,
        remainingTime: budget,
        executedTime: 0,
        wcetLo: task.wcetLo,
        wcetHi: task.wcetHi ?? task.wcetLo,
        priority: resolvePriority(task),
      };

      this.state.readyJobs.push(job);
      this.pushEvent(time, `${task.name} released`, "release");
    }
  }

  private detectDeadlineMisses(time: number) {
    const missed: SchedulerJob[] = [];

    this.state.readyJobs = this.state.readyJobs.filter((job) => {
      const deadlineMissed =
        time >= job.absoluteDeadline && job.remainingTime > 0;

      if (deadlineMissed) {
        missed.push(job);
      }

      return !deadlineMissed;
    });

    for (const job of missed) {
      this.state.deadlineMissCount += 1;
      this.pushEvent(time, `${job.taskName} missed deadline`, "deadline_miss");
    }
  }

  private selectReadyJob() {
    const candidates = this.state.readyJobs.filter(
      (job) => this.state.mode === "LO" || job.criticality === "HI",
    );

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      if (a.absoluteDeadline !== b.absoluteDeadline) {
        return a.absoluteDeadline - b.absoluteDeadline;
      }

      return a.releaseTime - b.releaseTime;
    });

    return candidates[0];
  }

  private triggerModeSwitch(atTime: number) {
    if (this.state.mode === "HI") {
      return;
    }

    this.state.mode = "HI";
    this.state.modeSwitches.push({ time: atTime });

    if (this.state.modeSwitches.length > MAX_MODE_SWITCH_HISTORY) {
      this.state.modeSwitches = this.state.modeSwitches.slice(
        this.state.modeSwitches.length - MAX_MODE_SWITCH_HISTORY,
      );
    }

    this.pushEvent(atTime, "MODE SWITCH -> HI", "mode_switch");

    const suspended = this.state.readyJobs.filter(
      (job) => job.criticality === "LO",
    );
    this.state.readyJobs = this.state.readyJobs.filter(
      (job) => job.criticality === "HI",
    );

    for (const job of suspended) {
      this.pushEvent(atTime, `${job.taskName} suspended`, "suspension");
    }
  }

  private pushSegment(segment: TimelineSegment) {
    const last = this.state.segments[this.state.segments.length - 1];

    if (
      last &&
      last.taskId === segment.taskId &&
      last.mode === segment.mode &&
      last.end === segment.start
    ) {
      last.end = segment.end;
      return;
    }

    this.state.segments.push(segment);

    if (this.state.segments.length > MAX_SEGMENT_HISTORY) {
      this.state.segments = this.state.segments.slice(
        this.state.segments.length - MAX_SEGMENT_HISTORY,
      );
    }
  }

  private pushEvent(
    time: number,
    message: string,
    type: SimulationEvent["type"],
  ) {
    this.state.events.push({
      id: `evt-${time}-${this.state.events.length}`,
      time,
      message,
      type,
    });

    if (this.state.events.length > MAX_EVENT_HISTORY) {
      this.state.events = this.state.events.slice(
        this.state.events.length - MAX_EVENT_HISTORY,
      );
    }
  }
}
