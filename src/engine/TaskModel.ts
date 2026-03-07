export type CriticalityLevel = "LO" | "HI";
export type SystemMode = "LO" | "HI";

export interface TaskModel {
  id: string;
  name: string;
  criticality: CriticalityLevel;
  period: number;
  deadline: number;
  wcetLo: number;
  wcetHi?: number;
  priority?: number;
}

export interface SchedulerJob {
  id: string;
  taskId: string;
  taskName: string;
  criticality: CriticalityLevel;
  releaseTime: number;
  absoluteDeadline: number;
  remainingTime: number;
  executedTime: number;
  wcetLo: number;
  wcetHi: number;
  priority: number;
}

export interface SimulationEvent {
  id: string;
  time: number;
  message: string;
  type:
    | "release"
    | "completion"
    | "deadline_miss"
    | "mode_switch"
    | "suspension";
}

export interface TimelineSegment {
  taskId: string;
  taskName: string;
  criticality: CriticalityLevel;
  start: number;
  end: number;
  mode: SystemMode;
}

export interface ModeSwitchMarker {
  time: number;
}

export const createTaskId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `task-${Math.random().toString(36).slice(2, 11)}`;
};

export const resolvePriority = (task: TaskModel) => {
  if (typeof task.priority === "number") {
    return task.priority;
  }

  return task.period;
};

export const sampleExecutionBudget = (task: TaskModel) => {
  if (task.criticality === "LO") {
    return task.wcetLo;
  }

  const hiBudget = Math.max(task.wcetHi ?? task.wcetLo, task.wcetLo);

  if (hiBudget <= task.wcetLo) {
    return hiBudget;
  }

  const shouldOverrunLoMode = Math.random() < 0.35;

  if (!shouldOverrunLoMode) {
    return Math.max(1, Math.floor(Math.random() * task.wcetLo) + 1);
  }

  const minOverrun = task.wcetLo + 1;
  return Math.floor(Math.random() * (hiBudget - minOverrun + 1)) + minOverrun;
};
