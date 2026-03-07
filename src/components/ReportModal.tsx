import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  type ModeSwitchMarker,
  type SimulationEvent,
  type SystemMode,
  type TaskModel,
  type TimelineSegment,
} from "../engine/TaskModel";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TaskModel[];
  events: SimulationEvent[];
  segments: TimelineSegment[];
  modeSwitches: ModeSwitchMarker[];
  time: number;
  mode: SystemMode;
  deadlineMissCount: number;
}

interface TaskStat {
  taskId: string;
  taskName: string;
  criticality: "LO" | "HI";
  releases: number;
  completions: number;
  misses: number;
  suspensions: number;
}

interface TaskExecutionRow {
  taskId: string;
  taskName: string;
  criticality: "LO" | "HI";
  execMs: number;
  cpuShare: number;
  completionRate: number;
  missRate: number;
}

interface TaskGuarantee {
  taskId: string;
  taskName: string;
  criticality: "LO" | "HI";
  responseLo: number;
  guaranteedLo: boolean;
  responseHi?: number;
  guaranteedHi?: boolean;
}

interface FormalAnalysisResult {
  loUtil: number;
  hiUtil: number;
  overallLoGuaranteed: boolean;
  overallHiGuaranteed: boolean;
  guarantees: TaskGuarantee[];
  failedLoCount: number;
  failedHiCount: number;
}

interface OptimizationResult {
  label: string;
  score: number;
  analysis: FormalAnalysisResult;
  optimizedTasks: TaskModel[];
  criticalityChanges: Array<{
    taskName: string;
    from: "LO" | "HI";
    to: "LO" | "HI";
  }>;
}

const BIN_COUNT = 24;

type ReportTab = "overview" | "waveforms" | "formal" | "tasks";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatPercent = (value: number) =>
  `${Math.max(0, value * 100).toFixed(1)}%`;

const formatMs = (value: number) => `${Math.round(value)} ms`;

const findTaskByEventMessage = (message: string, tasks: TaskModel[]) => {
  const ordered = [...tasks].sort((a, b) => b.name.length - a.name.length);
  return ordered.find((task) => message.startsWith(`${task.name} `));
};

const getTaskPriority = (task: TaskModel) => task.priority ?? task.period;

const sortByPriority = (tasks: TaskModel[]) =>
  [...tasks].sort((a, b) => {
    if (getTaskPriority(a) !== getTaskPriority(b)) {
      return getTaskPriority(a) - getTaskPriority(b);
    }

    if (a.deadline !== b.deadline) {
      return a.deadline - b.deadline;
    }

    return a.name.localeCompare(b.name);
  });

const assignPriorityByOrder = (tasks: TaskModel[], orderedIds: string[]) => {
  const rank = new Map<string, number>();
  orderedIds.forEach((id, index) => rank.set(id, index + 1));

  return tasks.map((task) => ({
    ...task,
    priority: rank.get(task.id) ?? getTaskPriority(task),
  }));
};

const responseTimeAnalysis = (
  wcet: number,
  deadline: number,
  hpTasks: TaskModel[],
  hpCost: (task: TaskModel) => number,
) => {
  let response = Math.max(1, wcet);

  for (let i = 0; i < 100; i += 1) {
    const interference = hpTasks.reduce(
      (sum, task) => sum + Math.ceil(response / task.period) * hpCost(task),
      0,
    );
    const next = wcet + interference;

    if (next === response) {
      break;
    }

    response = next;

    if (response > Math.max(100000, deadline * 50)) {
      break;
    }
  }

  return response;
};

const runFormalAnalysis = (tasks: TaskModel[]): FormalAnalysisResult => {
  const loUtil = tasks.reduce(
    (sum, task) => sum + task.wcetLo / task.period,
    0,
  );
  const hiTasks = tasks.filter((task) => task.criticality === "HI");
  const hiUtil = hiTasks.reduce(
    (sum, task) =>
      sum + Math.max(task.wcetHi ?? task.wcetLo, task.wcetLo) / task.period,
    0,
  );

  const loOrdered = sortByPriority(tasks);
  const hiOrdered = sortByPriority(hiTasks);

  const hiResponseMap = new Map<string, number>();
  const hiGuaranteedMap = new Map<string, boolean>();

  hiOrdered.forEach((task, index) => {
    const hp = hiOrdered.slice(0, index);
    const wcet = Math.max(task.wcetHi ?? task.wcetLo, task.wcetLo);
    const response = responseTimeAnalysis(
      wcet,
      task.deadline,
      hp,
      (candidate) =>
        Math.max(candidate.wcetHi ?? candidate.wcetLo, candidate.wcetLo),
    );

    hiResponseMap.set(task.id, response);
    hiGuaranteedMap.set(task.id, response <= task.deadline);
  });

  const guarantees = loOrdered.map((task, index) => {
    const hpLo = loOrdered.slice(0, index);
    const responseLo = responseTimeAnalysis(
      task.wcetLo,
      task.deadline,
      hpLo,
      (candidate) => candidate.wcetLo,
    );
    const guaranteedLo = responseLo <= task.deadline;

    return {
      taskId: task.id,
      taskName: task.name,
      criticality: task.criticality,
      responseLo,
      guaranteedLo,
      responseHi: hiResponseMap.get(task.id),
      guaranteedHi: hiGuaranteedMap.get(task.id),
    };
  });

  const failedLoCount = guarantees.filter(
    (entry) => !entry.guaranteedLo,
  ).length;
  const failedHiCount = guarantees.filter(
    (entry) => entry.criticality === "HI" && !entry.guaranteedHi,
  ).length;

  return {
    loUtil,
    hiUtil,
    overallLoGuaranteed: loUtil <= 1 && failedLoCount === 0,
    overallHiGuaranteed: hiUtil <= 1 && failedHiCount === 0,
    guarantees,
    failedLoCount,
    failedHiCount,
  };
};

const optimizeAssignment = (tasks: TaskModel[]): OptimizationResult => {
  const baseMap = new Map(tasks.map((task) => [task.id, task]));

  const priorityStrategies: Array<{ label: string; build: () => TaskModel[] }> =
    [
      {
        label: "Current Priority",
        build: () => tasks.map((task) => ({ ...task })),
      },
      {
        label: "Deadline Monotonic",
        build: () => {
          const ordered = [...tasks].sort((a, b) => a.deadline - b.deadline);
          return assignPriorityByOrder(
            tasks,
            ordered.map((task) => task.id),
          );
        },
      },
      {
        label: "Period Monotonic",
        build: () => {
          const ordered = [...tasks].sort((a, b) => a.period - b.period);
          return assignPriorityByOrder(
            tasks,
            ordered.map((task) => task.id),
          );
        },
      },
      {
        label: "HI-First Deadline",
        build: () => {
          const ordered = [...tasks].sort((a, b) => {
            if (a.criticality !== b.criticality) {
              return a.criticality === "HI" ? -1 : 1;
            }

            return a.deadline - b.deadline;
          });
          return assignPriorityByOrder(
            tasks,
            ordered.map((task) => task.id),
          );
        },
      },
    ];

  const criticalityVariants = [
    {
      label: "Baseline Criticality",
      apply: (input: TaskModel[]) => input,
    },
    {
      label: "Conservative Demotion",
      apply: (input: TaskModel[]) =>
        input.map((task) => {
          const ratio =
            Math.max(task.wcetHi ?? task.wcetLo, task.wcetLo) / task.wcetLo;

          if (task.criticality === "HI" && ratio <= 1.05) {
            return { ...task, criticality: "LO" as const, wcetHi: undefined };
          }

          return task;
        }),
    },
  ];

  let best: OptimizationResult | null = null;

  for (const priorityStrategy of priorityStrategies) {
    for (const criticalityVariant of criticalityVariants) {
      const candidateTasks = criticalityVariant.apply(priorityStrategy.build());
      const analysis = runFormalAnalysis(candidateTasks);

      const utilExcess =
        Math.max(0, analysis.loUtil - 1) + Math.max(0, analysis.hiUtil - 1);

      const criticalityChanges = candidateTasks
        .filter((task) => {
          const base = baseMap.get(task.id);
          return base ? base.criticality !== task.criticality : false;
        })
        .map((task) => {
          const base = baseMap.get(task.id)!;
          return {
            taskName: task.name,
            from: base.criticality,
            to: task.criticality,
          };
        });

      const score =
        utilExcess * 1200 +
        analysis.failedHiCount * 240 +
        analysis.failedLoCount * 160 +
        criticalityChanges.length * 2;

      const candidate: OptimizationResult = {
        label: `${priorityStrategy.label} + ${criticalityVariant.label}`,
        score,
        analysis,
        optimizedTasks: candidateTasks,
        criticalityChanges,
      };

      if (!best || candidate.score < best.score) {
        best = candidate;
      }
    }
  }

  return (
    best ?? {
      label: "Current Priority + Baseline Criticality",
      score: 0,
      analysis: runFormalAnalysis(tasks),
      optimizedTasks: tasks,
      criticalityChanges: [],
    }
  );
};

export function ReportModal({
  isOpen,
  onClose,
  tasks,
  events,
  segments,
  modeSwitches,
  time,
  mode,
  deadlineMissCount,
}: ReportModalProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");

  const report = useMemo(() => {
    if (!isOpen) {
      return null;
    }

    const lastSegmentEnd = segments.reduce(
      (maxEnd, segment) => Math.max(maxEnd, segment.end),
      0,
    );
    const anchorTime = Math.max(time, lastSegmentEnd);

    const windowMs = Math.max(500, Math.min(2400, anchorTime || 900));
    const windowStart = Math.max(0, anchorTime - windowMs);
    const windowEnd = Math.max(windowStart + 1, anchorTime || 1);
    const totalWindow = windowEnd - windowStart;

    const segmentsInWindow = segments.filter(
      (segment) => segment.end > windowStart && segment.start < windowEnd,
    );
    const eventsInWindow = events.filter(
      (event) => event.time >= windowStart && event.time <= windowEnd,
    );

    let hiExec = 0;
    let loExec = 0;

    for (const segment of segmentsInWindow) {
      const overlapStart = Math.max(segment.start, windowStart);
      const overlapEnd = Math.min(segment.end, windowEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (segment.criticality === "HI") {
        hiExec += overlap;
      } else {
        loExec += overlap;
      }
    }

    const taskStatsMap = new Map<string, TaskStat>();

    for (const task of tasks) {
      taskStatsMap.set(task.id, {
        taskId: task.id,
        taskName: task.name,
        criticality: task.criticality,
        releases: 0,
        completions: 0,
        misses: 0,
        suspensions: 0,
      });
    }

    for (const event of events) {
      const task = findTaskByEventMessage(event.message, tasks);

      if (!task) {
        continue;
      }

      const stats = taskStatsMap.get(task.id);

      if (!stats) {
        continue;
      }

      if (event.type === "release") {
        stats.releases += 1;
      }

      if (event.type === "completion") {
        stats.completions += 1;
      }

      if (event.type === "deadline_miss") {
        stats.misses += 1;
      }

      if (event.type === "suspension") {
        stats.suspensions += 1;
      }
    }

    const taskStats = [...taskStatsMap.values()];

    const loUtil = tasks.reduce(
      (sum, task) => sum + task.wcetLo / task.period,
      0,
    );
    const hiUtil = tasks
      .filter((task) => task.criticality === "HI")
      .reduce(
        (sum, task) =>
          sum + Math.max(task.wcetHi ?? task.wcetLo, task.wcetLo) / task.period,
        0,
      );

    const missRate =
      events.length === 0
        ? 0
        : events.filter((event) => event.type === "deadline_miss").length /
          Math.max(
            1,
            events.filter((event) => event.type === "release").length,
          );

    const modeSwitchCount = modeSwitches.length;
    const suspendedCount = events.filter(
      (event) => event.type === "suspension",
    ).length;

    const loTasksImpacted = taskStats.filter(
      (stat) =>
        stat.criticality === "LO" && (stat.suspensions > 0 || stat.misses > 0),
    ).length;

    const recommendations: string[] = [];

    const totalReleases = taskStats.reduce(
      (sum, stat) => sum + stat.releases,
      0,
    );
    const totalCompletions = taskStats.reduce(
      (sum, stat) => sum + stat.completions,
      0,
    );
    const totalTaskMisses = taskStats.reduce(
      (sum, stat) => sum + stat.misses,
      0,
    );
    const completionRate =
      totalReleases > 0 ? totalCompletions / totalReleases : 1;

    const cpuBusyRatio = clamp(
      (hiExec + loExec) / Math.max(1, totalWindow),
      0,
      1,
    );
    const hiExecShare = hiExec / Math.max(1, hiExec + loExec);
    const loExecShare = loExec / Math.max(1, hiExec + loExec);

    const eventCounts = {
      release: eventsInWindow.filter((event) => event.type === "release")
        .length,
      completion: eventsInWindow.filter((event) => event.type === "completion")
        .length,
      deadlineMiss: eventsInWindow.filter(
        (event) => event.type === "deadline_miss",
      ).length,
      suspension: eventsInWindow.filter((event) => event.type === "suspension")
        .length,
      modeSwitch: eventsInWindow.filter((event) => event.type === "mode_switch")
        .length,
    };

    const taskExecMap = new Map<string, number>();

    for (const segment of segmentsInWindow) {
      const overlapStart = Math.max(segment.start, windowStart);
      const overlapEnd = Math.min(segment.end, windowEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      taskExecMap.set(
        segment.taskId,
        (taskExecMap.get(segment.taskId) ?? 0) + overlap,
      );
    }

    const taskExecution: TaskExecutionRow[] = taskStats
      .map((stat) => {
        const execMs = taskExecMap.get(stat.taskId) ?? 0;
        return {
          taskId: stat.taskId,
          taskName: stat.taskName,
          criticality: stat.criticality,
          execMs,
          cpuShare: execMs / Math.max(1, hiExec + loExec),
          completionRate:
            stat.releases > 0 ? stat.completions / stat.releases : 1,
          missRate: stat.releases > 0 ? stat.misses / stat.releases : 0,
        };
      })
      .sort((a, b) => b.execMs - a.execMs);

    const findings: string[] = [];

    if (cpuBusyRatio < 0.35) {
      findings.push(
        "CPU is lightly loaded in this window, so no misses are expected under the current settings.",
      );
    } else if (cpuBusyRatio > 0.85) {
      findings.push(
        "CPU is heavily loaded; deadline risk increases sharply when burst arrivals or mode switches occur.",
      );
    } else {
      findings.push(
        "CPU load is moderate; current timing margins look healthy for this run window.",
      );
    }

    if (modeSwitchCount > 0) {
      findings.push(
        `${modeSwitchCount} mode switch(es) occurred. LO tasks can be suspended in HI mode, which explains LO-service reduction.`,
      );
    }

    if (totalTaskMisses === 0) {
      findings.push(
        "No deadline misses were observed. This indicates the current workload is schedulable for the sampled behavior.",
      );
    }

    const modeSwitchTimes = modeSwitches
      .filter(
        (marker) => marker.time >= windowStart && marker.time <= windowEnd,
      )
      .map((marker) => marker.time);

    const formalAnalysis = runFormalAnalysis(tasks);
    const optimization = optimizeAssignment(tasks);

    if (
      !formalAnalysis.overallLoGuaranteed ||
      !formalAnalysis.overallHiGuaranteed
    ) {
      findings.push(
        `Formal checks indicate risk: LO guarantees ${formalAnalysis.overallLoGuaranteed ? "pass" : "fail"}, HI guarantees ${formalAnalysis.overallHiGuaranteed ? "pass" : "fail"}.`,
      );
    }

    if (loUtil > 1) {
      recommendations.push(
        "LO-mode utilization exceeds 100%. Consider increasing periods or reducing WCET_LO for lower-criticality tasks.",
      );
    }

    if (hiUtil > 1) {
      recommendations.push(
        "HI-mode utilization exceeds 100%. HI-criticality tasks are overloaded; raise periods, reduce WCET_HI, or add cores.",
      );
    }

    for (const task of tasks) {
      const hiBudget = Math.max(task.wcetHi ?? task.wcetLo, task.wcetLo);
      const ratio = hiBudget / task.wcetLo;

      if (task.criticality === "LO" && ratio >= 1.4) {
        recommendations.push(
          `${task.name}: WCET_HI is much larger than WCET_LO. Consider assigning this task to HI criticality.`,
        );
      }

      if (task.criticality === "HI" && ratio <= 1.05) {
        recommendations.push(
          `${task.name}: WCET_HI is very close to WCET_LO. It may be a candidate for LO criticality if safety allows.`,
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "Current assignment appears balanced for this run. Collect longer traces and compare with multiple random seeds before final conclusions.",
      );
    }

    const missesByTask = taskStats
      .filter((stat) => stat.misses > 0)
      .map((stat) => {
        const reasons: string[] = [];

        if (
          stat.criticality === "LO" &&
          modeSwitchCount > 0 &&
          stat.suspensions > 0
        ) {
          reasons.push(
            "LO jobs were suspended after the system switched to HI mode.",
          );
        }

        if (stat.criticality === "HI" && hiUtil > 1) {
          reasons.push(
            "HI-mode utilization is above 100%, so not all HI jobs can finish in time.",
          );
        }

        if (stat.criticality === "LO" && loUtil > 1 && modeSwitchCount === 0) {
          reasons.push(
            "Even without a mode switch, LO-mode demand is above processor capacity.",
          );
        }

        if (stat.releases > stat.completions + stat.misses) {
          reasons.push(
            "Release rate is higher than completion rate, causing backlog and deadline pressure.",
          );
        }

        if (reasons.length === 0) {
          reasons.push(
            "Misses likely come from transient overload and priority preemption interactions.",
          );
        }

        return {
          taskName: stat.taskName,
          misses: stat.misses,
          reason: reasons.join(" "),
        };
      });

    const execLoBins = Array.from({ length: BIN_COUNT }, () => 0);
    const execHiBins = Array.from({ length: BIN_COUNT }, () => 0);
    const missBins = Array.from({ length: BIN_COUNT }, () => 0);
    const modeBins = Array.from({ length: BIN_COUNT }, () => false);

    const binSize = totalWindow / BIN_COUNT;

    for (const segment of segmentsInWindow) {
      const leftIndex = clamp(
        Math.floor((segment.start - windowStart) / binSize),
        0,
        BIN_COUNT - 1,
      );
      const rightIndex = clamp(
        Math.floor((segment.end - windowStart) / binSize),
        0,
        BIN_COUNT - 1,
      );

      for (let i = leftIndex; i <= rightIndex; i += 1) {
        const binStart = windowStart + i * binSize;
        const binEnd = binStart + binSize;
        const overlap = Math.max(
          0,
          Math.min(segment.end, binEnd) - Math.max(segment.start, binStart),
        );

        if (segment.criticality === "HI") {
          execHiBins[i] += overlap;
        } else {
          execLoBins[i] += overlap;
        }
      }
    }

    for (const event of eventsInWindow) {
      if (event.type !== "deadline_miss") {
        continue;
      }

      const index = clamp(
        Math.floor((event.time - windowStart) / binSize),
        0,
        BIN_COUNT - 1,
      );
      missBins[index] += 1;
    }

    for (let i = 0; i < BIN_COUNT; i += 1) {
      const midPoint = windowStart + (i + 0.5) * binSize;
      const switchesBeforePoint = modeSwitches.filter(
        (marker) => marker.time <= midPoint,
      ).length;
      modeBins[i] = switchesBeforePoint % 2 === 1;
    }

    const maxExecBin = Math.max(
      1,
      ...execLoBins.map((v, i) => v + execHiBins[i]),
    );
    const maxMissBin = Math.max(1, ...missBins);
    const hasExecutionData = segmentsInWindow.length > 0;
    const hasMissData = missBins.some((value) => value > 0);

    return {
      windowStart,
      windowEnd,
      totalWindow,
      hiExec,
      loExec,
      modeSwitchCount,
      suspendedCount,
      loTasksImpacted,
      loUtil,
      hiUtil,
      missRate,
      totalReleases,
      totalCompletions,
      completionRate,
      cpuBusyRatio,
      hiExecShare,
      loExecShare,
      eventCounts,
      modeSwitchTimes,
      formalAnalysis,
      optimization,
      taskExecution,
      findings,
      taskStats,
      missesByTask,
      recommendations,
      execLoBins,
      execHiBins,
      missBins,
      modeBins,
      maxExecBin,
      maxMissBin,
      hasExecutionData,
      hasMissData,
    };
  }, [
    deadlineMissCount,
    events,
    isOpen,
    mode,
    modeSwitches,
    segments,
    tasks,
    time,
  ]);

  return (
    <AnimatePresence>
      {isOpen && report ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/66 p-4 backdrop-blur-[8px]"
          onClick={onClose}
        >
          <motion.section
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: 8 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="Simulation report"
            onClick={(event) => event.stopPropagation()}
            className="flex h-[88vh] w-full max-w-[1120px] min-w-0 flex-col rounded-3xl border border-white/20 bg-slate-900/90 p-5 shadow-[0_24px_64px_rgba(2,6,23,0.64)] backdrop-blur-xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Simulation Summary
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
                  Mixed-Criticality Report
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Window {formatMs(report.windowStart)} to{" "}
                  {formatMs(report.windowEnd)} | Current mode {mode}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.1]"
              >
                Close
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["overview", "Overview"],
                  ["waveforms", "Waveforms"],
                  ["formal", "Formal + Optimization"],
                  ["tasks", "Task Analysis"],
                ] as Array<[ReportTab, string]>
              ).map(([tabValue, label]) => (
                <button
                  key={tabValue}
                  type="button"
                  onClick={() => setActiveTab(tabValue)}
                  className={`rounded-xl border px-3 py-1.5 text-xs transition ${
                    activeTab === tabValue
                      ? "border-cyan-300/40 bg-cyan-500/18 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                  className="h-full space-y-4 overflow-y-auto pr-1"
                >
                  {activeTab === "overview" ? (
                    <>
                      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Deadline Misses
                          </p>
                          <p className="mt-1 text-xl font-semibold text-rose-100">
                            {deadlineMissCount}
                          </p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Mode Switches
                          </p>
                          <p className="mt-1 text-xl font-semibold text-amber-100">
                            {report.modeSwitchCount}
                          </p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            LO Utilization
                          </p>
                          <p className="mt-1 text-xl font-semibold text-slate-100">
                            {formatPercent(report.loUtil)}
                          </p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            HI Utilization
                          </p>
                          <p className="mt-1 text-xl font-semibold text-slate-100">
                            {formatPercent(report.hiUtil)}
                          </p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            Completion Rate
                          </p>
                          <p className="mt-1 text-xl font-semibold text-emerald-100">
                            {formatPercent(report.completionRate)}
                          </p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">
                            CPU Busy Ratio
                          </p>
                          <p className="mt-1 text-xl font-semibold text-cyan-100">
                            {formatPercent(report.cpuBusyRatio)}
                          </p>
                        </article>
                      </section>

                      <section className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                        <h3 className="text-sm font-semibold text-slate-100">
                          What This Means
                        </h3>
                        <div className="mt-2 space-y-2 text-xs text-slate-200">
                          {report.findings.map((item, index) => (
                            <p
                              key={`finding-${index}`}
                              className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2"
                            >
                              {item}
                            </p>
                          ))}
                        </div>

                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-slate-300">
                            HI execution share:{" "}
                            <span className="text-slate-100">
                              {formatPercent(report.hiExecShare)}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-slate-300">
                            LO execution share:{" "}
                            <span className="text-slate-100">
                              {formatPercent(report.loExecShare)}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-slate-300">
                            Releases/completions:{" "}
                            <span className="text-slate-100">
                              {report.totalReleases}/{report.totalCompletions}
                            </span>
                          </p>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Recommendations
                        </h3>
                        <div className="mt-2 space-y-2 text-xs text-slate-200">
                          {report.recommendations.map((item, index) => (
                            <p
                              key={`recommendation-${index}`}
                              className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2"
                            >
                              {item}
                            </p>
                          ))}
                        </div>
                      </section>
                    </>
                  ) : null}

                  {activeTab === "waveforms" ? (
                    <section className="grid gap-4 lg:grid-cols-2">
                      <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Execution Waveform
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Bar height shows CPU busy time in each bin. Blue is HI
                          execution, slate is LO execution.
                        </p>

                        {!report.hasExecutionData ? (
                          <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100">
                            No runtime execution data yet. Start the simulation
                            to generate waveform traces.
                          </p>
                        ) : null}

                        <div className="mt-3 flex h-32 items-end gap-1">
                          {report.execLoBins.map((lo, index) => {
                            const hi = report.execHiBins[index];
                            const loHeight =
                              lo > 0
                                ? Math.max(3, (lo / report.maxExecBin) * 100)
                                : 0;
                            const hiHeight =
                              hi > 0
                                ? Math.max(3, (hi / report.maxExecBin) * 100)
                                : 0;

                            return (
                              <div
                                key={`exec-bin-${index}`}
                                className="flex h-full flex-1 items-end"
                              >
                                <div className="flex h-full w-full flex-col justify-end gap-[2px]">
                                  <div
                                    className="rounded-t-sm bg-blue-400/85"
                                    style={{ height: `${hiHeight}%` }}
                                    title={`HI: ${Math.round(hi)} ms`}
                                  />
                                  <div
                                    className="rounded-t-sm bg-slate-500/75"
                                    style={{ height: `${loHeight}%` }}
                                    title={`LO: ${Math.round(lo)} ms`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </article>

                      <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Mode and Miss Waveform
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Top strip shows LO/HI mode over time. Bottom bars show
                          deadline miss density.
                        </p>

                        {!report.hasMissData ? (
                          <p className="mt-2 rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-100">
                            No deadline misses observed in this window.
                          </p>
                        ) : null}

                        <div className="mt-3 space-y-2">
                          <div className="flex h-5 gap-1">
                            {report.modeBins.map((inHiMode, index) => (
                              <div
                                key={`mode-bin-${index}`}
                                className={`flex-1 rounded-sm ${inHiMode ? "bg-red-400/80" : "bg-emerald-400/70"}`}
                                title={inHiMode ? "HI mode" : "LO mode"}
                              />
                            ))}
                          </div>

                          <div className="flex h-20 items-end gap-1">
                            {report.missBins.map((misses, index) => {
                              const height =
                                misses > 0
                                  ? Math.max(
                                      6,
                                      (misses / report.maxMissBin) * 100,
                                    )
                                  : 0;

                              return (
                                <div
                                  key={`miss-bin-${index}`}
                                  className="flex h-full flex-1 items-end"
                                >
                                  <div
                                    className="w-full rounded-t-sm bg-rose-400/85"
                                    style={{ height: `${height}%` }}
                                    title={`${misses} miss(es)`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </article>

                      <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-3 lg:col-span-2">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Event Breakdown and Mode Switch Times
                        </h3>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-slate-300">
                            Releases:{" "}
                            <span className="text-slate-100">
                              {report.eventCounts.release}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-slate-300">
                            Completions:{" "}
                            <span className="text-slate-100">
                              {report.eventCounts.completion}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-slate-300">
                            Misses:{" "}
                            <span className="text-rose-100">
                              {report.eventCounts.deadlineMiss}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-slate-300">
                            Suspensions:{" "}
                            <span className="text-amber-100">
                              {report.eventCounts.suspension}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-slate-300">
                            Mode switches:{" "}
                            <span className="text-slate-100">
                              {report.eventCounts.modeSwitch}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-slate-300">
                            Miss rate:{" "}
                            <span className="text-slate-100">
                              {formatPercent(report.missRate)}
                            </span>
                          </p>
                        </div>
                      </article>
                    </section>
                  ) : null}

                  {activeTab === "formal" ? (
                    <section className="grid gap-4 lg:grid-cols-2">
                      <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Formal Timing Guarantees (RTA)
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Fixed-priority response-time analysis in LO mode (all
                          tasks) and HI mode (HI tasks only).
                        </p>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-slate-300">
                            LO Guarantees:{" "}
                            <span
                              className={
                                report.formalAnalysis.overallLoGuaranteed
                                  ? "text-emerald-100"
                                  : "text-rose-200"
                              }
                            >
                              {report.formalAnalysis.overallLoGuaranteed
                                ? "PASS"
                                : "FAIL"}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-slate-300">
                            HI Guarantees:{" "}
                            <span
                              className={
                                report.formalAnalysis.overallHiGuaranteed
                                  ? "text-emerald-100"
                                  : "text-rose-200"
                              }
                            >
                              {report.formalAnalysis.overallHiGuaranteed
                                ? "PASS"
                                : "FAIL"}
                            </span>
                          </p>
                        </div>

                        <div className="mt-2 overflow-auto rounded-xl border border-white/10">
                          <table className="w-full min-w-[520px] border-collapse text-xs">
                            <thead className="bg-slate-900/80 text-slate-400">
                              <tr>
                                <th className="px-2 py-2 text-left">Task</th>
                                <th className="px-2 py-2 text-left">Crit</th>
                                <th className="px-2 py-2 text-left">
                                  R_LO / D
                                </th>
                                <th className="px-2 py-2 text-left">
                                  R_HI / D
                                </th>
                                <th className="px-2 py-2 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.formalAnalysis.guarantees.map((entry) => (
                                <tr
                                  key={`guarantee-${entry.taskId}`}
                                  className="border-t border-white/10 text-slate-200"
                                >
                                  <td className="px-2 py-2">
                                    {entry.taskName}
                                  </td>
                                  <td className="px-2 py-2">
                                    {entry.criticality}
                                  </td>
                                  <td className="px-2 py-2">
                                    {formatMs(entry.responseLo)} /{" "}
                                    {formatMs(
                                      tasks.find(
                                        (task) => task.id === entry.taskId,
                                      )?.deadline ?? 0,
                                    )}
                                  </td>
                                  <td className="px-2 py-2">
                                    {entry.criticality === "HI" &&
                                    typeof entry.responseHi === "number"
                                      ? `${formatMs(entry.responseHi)} / ${formatMs(tasks.find((task) => task.id === entry.taskId)?.deadline ?? 0)}`
                                      : "N/A"}
                                  </td>
                                  <td className="px-2 py-2">
                                    <span
                                      className={
                                        entry.guaranteedLo &&
                                        (entry.criticality === "LO" ||
                                          entry.guaranteedHi)
                                          ? "text-emerald-100"
                                          : "text-rose-200"
                                      }
                                    >
                                      {entry.guaranteedLo &&
                                      (entry.criticality === "LO" ||
                                        entry.guaranteedHi)
                                        ? "Guaranteed"
                                        : "At Risk"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </article>

                      <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Optimization Result
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                          Best candidate from automatic search over priority
                          policies and conservative criticality reassignment.
                        </p>

                        <div className="mt-2 space-y-2 text-xs text-slate-300">
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                            Strategy:{" "}
                            <span className="text-slate-100">
                              {report.optimization.label}
                            </span>
                          </p>
                          <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                            Predicted LO/HI Guarantee:{" "}
                            <span className="text-slate-100">
                              {report.optimization.analysis.overallLoGuaranteed
                                ? "PASS"
                                : "FAIL"}{" "}
                              /{" "}
                              {report.optimization.analysis.overallHiGuaranteed
                                ? "PASS"
                                : "FAIL"}
                            </span>
                          </p>
                        </div>

                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-xs">
                          <p className="mb-1 text-slate-400">
                            Recommended priority order
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {[...report.optimization.optimizedTasks]
                              .sort(
                                (a, b) =>
                                  getTaskPriority(a) - getTaskPriority(b),
                              )
                              .map((task) => (
                                <span
                                  key={`opt-priority-${task.id}`}
                                  className="rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2 py-0.5 text-cyan-100"
                                >
                                  P{getTaskPriority(task)} {task.name} (
                                  {task.criticality})
                                </span>
                              ))}
                          </div>
                        </div>
                      </article>
                    </section>
                  ) : null}

                  {activeTab === "tasks" ? (
                    <>
                      <section className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                        <h3 className="text-sm font-semibold text-slate-100">
                          Execution Share and Timing Quality by Task
                        </h3>
                        <div className="mt-2 overflow-auto rounded-xl border border-white/10">
                          <table className="w-full min-w-[560px] border-collapse text-xs">
                            <thead className="bg-slate-900/80 text-slate-400">
                              <tr>
                                <th className="px-2 py-2 text-left">Task</th>
                                <th className="px-2 py-2 text-left">Crit</th>
                                <th className="px-2 py-2 text-left">
                                  Exec in Window
                                </th>
                                <th className="px-2 py-2 text-left">
                                  CPU Share
                                </th>
                                <th className="px-2 py-2 text-left">
                                  Completion Rate
                                </th>
                                <th className="px-2 py-2 text-left">
                                  Miss Rate
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.taskExecution.map((row) => (
                                <tr
                                  key={row.taskId}
                                  className="border-t border-white/10 text-slate-200"
                                >
                                  <td className="px-2 py-2">{row.taskName}</td>
                                  <td className="px-2 py-2">
                                    {row.criticality}
                                  </td>
                                  <td className="px-2 py-2">
                                    {formatMs(row.execMs)}
                                  </td>
                                  <td className="px-2 py-2">
                                    {formatPercent(row.cpuShare)}
                                  </td>
                                  <td className="px-2 py-2 text-emerald-100">
                                    {formatPercent(row.completionRate)}
                                  </td>
                                  <td className="px-2 py-2 text-rose-200">
                                    {formatPercent(row.missRate)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section className="grid gap-4 lg:grid-cols-2">
                        <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                          <h3 className="text-sm font-semibold text-slate-100">
                            Per-Task Deadlines and Misses
                          </h3>
                          <div className="mt-2 overflow-auto rounded-xl border border-white/10">
                            <table className="w-full min-w-[460px] border-collapse text-xs">
                              <thead className="bg-slate-900/80 text-slate-400">
                                <tr>
                                  <th className="px-2 py-2 text-left">Task</th>
                                  <th className="px-2 py-2 text-left">Crit</th>
                                  <th className="px-2 py-2 text-left">
                                    Releases
                                  </th>
                                  <th className="px-2 py-2 text-left">
                                    Completions
                                  </th>
                                  <th className="px-2 py-2 text-left">
                                    Misses
                                  </th>
                                  <th className="px-2 py-2 text-left">
                                    Suspensions
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {report.taskStats.map((stat) => (
                                  <tr
                                    key={stat.taskId}
                                    className="border-t border-white/10 text-slate-200"
                                  >
                                    <td className="px-2 py-2">
                                      {stat.taskName}
                                    </td>
                                    <td className="px-2 py-2">
                                      {stat.criticality}
                                    </td>
                                    <td className="px-2 py-2">
                                      {stat.releases}
                                    </td>
                                    <td className="px-2 py-2">
                                      {stat.completions}
                                    </td>
                                    <td className="px-2 py-2 text-rose-200">
                                      {stat.misses}
                                    </td>
                                    <td className="px-2 py-2 text-amber-200">
                                      {stat.suspensions}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </article>

                        <article className="rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                          <h3 className="text-sm font-semibold text-slate-100">
                            Why Misses Happened
                          </h3>
                          <div className="mt-2 space-y-2 text-xs text-slate-300">
                            {report.missesByTask.length === 0 ? (
                              <p className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-2 text-emerald-100">
                                No missed deadlines observed in this run window.
                              </p>
                            ) : (
                              report.missesByTask.map((item) => (
                                <div
                                  key={item.taskName}
                                  className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-2.5 py-2"
                                >
                                  <p className="font-medium text-rose-100">
                                    {item.taskName}: {item.misses} miss(es)
                                  </p>
                                  <p className="mt-1 text-slate-200">
                                    {item.reason}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </article>
                      </section>
                    </>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
