import { motion } from "framer-motion";
import { useSchedulerStore } from "../store/schedulerStore";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export function SystemStatusPanel() {
  const mode = useSchedulerStore((state) => state.mode);
  const time = useSchedulerStore((state) => state.time);
  const isRunning = useSchedulerStore((state) => state.isRunning);
  const isCompleted = useSchedulerStore((state) => state.isCompleted);
  const simulationEndTime = useSchedulerStore(
    (state) => state.simulationEndTime,
  );
  const effectiveSimulationEndTime = useSchedulerStore(
    (state) => state.effectiveSimulationEndTime,
  );
  const runningTaskName = useSchedulerStore((state) => state.runningTaskName);
  const activeTaskCount = useSchedulerStore((state) => state.activeTaskCount);
  const deadlineMissCount = useSchedulerStore(
    (state) => state.deadlineMissCount,
  );
  const modeSwitches = useSchedulerStore((state) => state.modeSwitches);

  const lifecycleLabel = isCompleted
    ? "Completed"
    : isRunning
      ? "Running"
      : time > 0
        ? "Paused"
        : "Ready";

  const lifecycleClass = isCompleted
    ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
    : isRunning
      ? "border-cyan-300/40 bg-cyan-500/20 text-cyan-100"
      : "border-slate-300/30 bg-slate-500/20 text-slate-100";

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.06 }}
      className="glass-card p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-50">
          System Status
        </h2>
        <motion.span
          animate={mode === "HI" ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ repeat: mode === "HI" ? Infinity : 0, duration: 1.2 }}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            mode === "HI"
              ? "border-red-300/50 bg-red-500/20 text-red-100"
              : "border-blue-300/40 bg-blue-500/20 text-blue-100"
          }`}
        >
          {mode} MODE
        </motion.span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Simulation Time" value={`${time} ms`} />
        <StatTile label="Running Task" value={runningTaskName ?? "Idle"} />
        <StatTile label="Active Jobs" value={activeTaskCount} />
        <StatTile label="Deadline Misses" value={deadlineMissCount} />
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">
          Simulation Lifecycle
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs ${lifecycleClass}`}
          >
            {lifecycleLabel}
          </span>
          <span className="text-xs text-slate-400">
            {simulationEndTime === null
              ? `Auto (LCM ${effectiveSimulationEndTime} ms)`
              : `Ends at ${effectiveSimulationEndTime} ms`}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">
          Mode Switch Indicator
        </p>
        <p className="mt-1">
          {modeSwitches.length > 0
            ? `${modeSwitches.length} switch event(s) detected`
            : "No mode switch yet"}
        </p>
      </div>
    </motion.section>
  );
}
