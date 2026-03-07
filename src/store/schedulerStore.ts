import { create } from "zustand";
import { SchedulerEngine } from "../engine/SchedulerEngine";
import { SimulationClock } from "../engine/SimulationClock";
import {
  createTaskId,
  type ModeSwitchMarker,
  type SimulationEvent,
  type SystemMode,
  type TaskModel,
  type TimelineSegment,
} from "../engine/TaskModel";

interface SchedulerStore {
  tasks: TaskModel[];
  mode: SystemMode;
  time: number;
  runningTaskName: string | null;
  activeTaskCount: number;
  deadlineMissCount: number;
  events: SimulationEvent[];
  segments: TimelineSegment[];
  modeSwitches: ModeSwitchMarker[];
  isRunning: boolean;
  isCompleted: boolean;
  speed: number;
  tickSize: number;
  simulationEndTime: number | null;
  effectiveSimulationEndTime: number;
  addTask: (task: Omit<TaskModel, "id">) => void;
  updateTask: (taskId: string, updates: Partial<Omit<TaskModel, "id">>) => void;
  deleteTask: (taskId: string) => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  pauseSimulation: () => void;
  resetSimulation: () => void;
  setSpeed: (speed: number) => void;
  setTickSize: (tickSize: number) => void;
  setSimulationEndTime: (endTime: number | null) => void;
  tick: () => void;
}

const MIN_SIMULATION_END_TIME = 500;
const MAX_AUTO_SIMULATION_END_TIME = 20000;

const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }

  return x || 1;
};

const lcm = (a: number, b: number): number => {
  if (a === 0 || b === 0) {
    return 0;
  }

  const value = (a / gcd(a, b)) * b;
  return Number.isFinite(value)
    ? Math.abs(value)
    : MAX_AUTO_SIMULATION_END_TIME;
};

const computeAutoSimulationEndTime = (tasks: TaskModel[]) => {
  if (tasks.length === 0) {
    return 1000;
  }

  let hyperperiod = Math.max(1, tasks[0].period);

  for (const task of tasks.slice(1)) {
    hyperperiod = lcm(hyperperiod, Math.max(1, task.period));

    if (hyperperiod > MAX_AUTO_SIMULATION_END_TIME) {
      return MAX_AUTO_SIMULATION_END_TIME;
    }
  }

  return Math.max(MIN_SIMULATION_END_TIME, hyperperiod);
};

const resolveEffectiveEndTime = (
  tasks: TaskModel[],
  simulationEndTime: number | null,
) => {
  if (typeof simulationEndTime === "number") {
    return Math.max(MIN_SIMULATION_END_TIME, simulationEndTime);
  }

  return computeAutoSimulationEndTime(tasks);
};

const speedToInterval = (speed: number) => {
  if (speed === 5) {
    return 35;
  }

  if (speed === 2) {
    return 70;
  }

  return 130;
};

const initialTasks: TaskModel[] = [
  {
    id: createTaskId(),
    name: "T1",
    criticality: "HI",
    period: 100,
    deadline: 100,
    wcetLo: 20,
    wcetHi: 40,
    priority: 1,
  },
  {
    id: createTaskId(),
    name: "T2",
    criticality: "LO",
    period: 80,
    deadline: 80,
    wcetLo: 18,
    priority: 2,
  },
  {
    id: createTaskId(),
    name: "T3",
    criticality: "HI",
    period: 150,
    deadline: 150,
    wcetLo: 25,
    wcetHi: 50,
    priority: 3,
  },
];

let engine = new SchedulerEngine();
const clock = new SimulationClock();

const clearTimer = () => {
  clock.stop();
};

const restartTimer = (tick: () => void, speed: number) => {
  clock.start(() => {
    tick();
  }, speedToInterval(speed));
};

const normalizeTask = (task: Omit<TaskModel, "id">): Omit<TaskModel, "id"> => {
  const wcetLo = Math.max(1, Number(task.wcetLo) || 1);
  const period = Math.max(1, Number(task.period) || 1);
  const deadline = Math.max(1, Number(task.deadline) || 1);
  const wcetHi =
    task.criticality === "HI"
      ? Math.max(wcetLo, Number(task.wcetHi) || wcetLo)
      : undefined;

  return {
    ...task,
    period,
    deadline,
    wcetLo,
    wcetHi,
    priority:
      typeof task.priority === "number"
        ? Math.max(1, task.priority)
        : undefined,
  };
};

export const useSchedulerStore = create<SchedulerStore>((set, get) => ({
  tasks: initialTasks,
  mode: "LO",
  time: 0,
  runningTaskName: null,
  activeTaskCount: 0,
  deadlineMissCount: 0,
  events: [],
  segments: [],
  modeSwitches: [],
  isRunning: false,
  isCompleted: false,
  speed: 1,
  tickSize: 1,
  simulationEndTime: null,
  effectiveSimulationEndTime: computeAutoSimulationEndTime(initialTasks),

  addTask: (task) => {
    const normalized = normalizeTask(task);
    const nextTask = { ...normalized, id: createTaskId() };

    set((state) => {
      const nextTasks = [...state.tasks, nextTask];

      return {
        tasks: nextTasks,
        effectiveSimulationEndTime: resolveEffectiveEndTime(
          nextTasks,
          state.simulationEndTime,
        ),
      };
    });
  },

  updateTask: (taskId, updates) => {
    set((state) => {
      const nextTasks = state.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const merged = normalizeTask({ ...task, ...updates });
        return {
          ...task,
          ...merged,
          wcetHi: merged.criticality === "HI" ? merged.wcetHi : undefined,
        };
      });

      return {
        tasks: nextTasks,
        effectiveSimulationEndTime: resolveEffectiveEndTime(
          nextTasks,
          state.simulationEndTime,
        ),
      };
    });
  },

  deleteTask: (taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== taskId),
      effectiveSimulationEndTime: resolveEffectiveEndTime(
        state.tasks.filter((task) => task.id !== taskId),
        state.simulationEndTime,
      ),
    }));
  },

  startSimulation: () => {
    const state = get();

    if (state.isRunning || state.isCompleted) {
      return;
    }

    set({ isRunning: true });
    restartTimer(get().tick, get().speed);
  },

  stopSimulation: () => {
    get().resetSimulation();
  },

  pauseSimulation: () => {
    clearTimer();
    set({ isRunning: false });
  },

  resetSimulation: () => {
    clearTimer();
    engine = new SchedulerEngine();

    const snapshot = engine.getSnapshot();

    set({
      mode: snapshot.mode,
      time: snapshot.time,
      runningTaskName: snapshot.runningTaskName,
      activeTaskCount: snapshot.activeTaskCount,
      deadlineMissCount: snapshot.deadlineMissCount,
      events: snapshot.events,
      segments: snapshot.segments,
      modeSwitches: snapshot.modeSwitches,
      isRunning: false,
      isCompleted: false,
    });
  },

  setSpeed: (speed) => {
    const safeSpeed = [1, 2, 5].includes(speed) ? speed : 1;
    set({ speed: safeSpeed });

    if (get().isRunning) {
      restartTimer(get().tick, safeSpeed);
    }
  },

  setTickSize: (tickSize) => {
    const safeTick = [1, 2, 5].includes(tickSize) ? tickSize : 1;
    set({ tickSize: safeTick });
  },

  setSimulationEndTime: (endTime) => {
    const normalized =
      typeof endTime === "number" && Number.isFinite(endTime)
        ? Math.max(MIN_SIMULATION_END_TIME, endTime)
        : null;

    set((state) => {
      const effectiveEndTime = resolveEffectiveEndTime(state.tasks, normalized);
      const reachedLimit = state.time >= effectiveEndTime;

      if (reachedLimit && state.isRunning) {
        clearTimer();
      }

      return {
        simulationEndTime: normalized,
        effectiveSimulationEndTime: effectiveEndTime,
        isRunning: reachedLimit ? false : state.isRunning,
        isCompleted: reachedLimit,
      };
    });
  },

  tick: () => {
    const state = get();

    if (state.isCompleted) {
      clearTimer();
      set({ isRunning: false });
      return;
    }

    const snapshot = engine.step(state.tasks, state.tickSize);

    const reachedEnd = snapshot.time >= state.effectiveSimulationEndTime;

    if (reachedEnd) {
      clearTimer();
    }

    set({
      mode: snapshot.mode,
      time: snapshot.time,
      runningTaskName: reachedEnd ? null : snapshot.runningTaskName,
      activeTaskCount: snapshot.activeTaskCount,
      deadlineMissCount: snapshot.deadlineMissCount,
      events: snapshot.events,
      segments: snapshot.segments,
      modeSwitches: snapshot.modeSwitches,
      isRunning: reachedEnd ? false : state.isRunning,
      isCompleted: reachedEnd,
    });
  },
}));
