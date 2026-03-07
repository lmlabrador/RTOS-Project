import { motion } from "framer-motion";
import { useMemo } from "react";
import { useSchedulerStore } from "../store/schedulerStore";

const WINDOW_MS = 900;

const laneColor = {
  HI: "from-blue-500 to-violet-500",
  LO: "from-slate-500 to-slate-400",
};

const AXIS_TICKS = 6;

const formatTimelineTime = (ms: number) => {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }

  return `${Math.round(ms)} ms`;
};

export function SchedulerTimeline() {
  const tasks = useSchedulerStore((state) => state.tasks);
  const segments = useSchedulerStore((state) => state.segments);
  const modeSwitches = useSchedulerStore((state) => state.modeSwitches);
  const time = useSchedulerStore((state) => state.time);

  const viewStart = Math.max(0, time - WINDOW_MS);

  const visibleSegments = useMemo(
    () =>
      segments.filter(
        (segment) => segment.end > viewStart && segment.start < time + 1,
      ),
    [segments, viewStart, time],
  );

  const visibleModeSwitches = useMemo(
    () =>
      modeSwitches.filter(
        (marker) => marker.time >= viewStart && marker.time <= time,
      ),
    [modeSwitches, viewStart, time],
  );

  const segmentsByTask = useMemo(() => {
    const grouped = new Map<string, typeof visibleSegments>();

    for (const segment of visibleSegments) {
      const bucket = grouped.get(segment.taskId);

      if (bucket) {
        bucket.push(segment);
      } else {
        grouped.set(segment.taskId, [segment]);
      }
    }

    return grouped;
  }, [visibleSegments]);

  const xFor = (ms: number) => ((ms - viewStart) / WINDOW_MS) * 100;
  const tickTimes = useMemo(
    () =>
      Array.from({ length: AXIS_TICKS + 1 }, (_, index) => {
        const ratio = index / AXIS_TICKS;
        return viewStart + ratio * WINDOW_MS;
      }),
    [viewStart],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="glass-card flex min-h-0 min-w-0 flex-col p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-slate-50">
            Scheduler Timeline
          </h2>
          <p className="text-xs text-slate-400">
            Live Gantt view (last {WINDOW_MS} ms)
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> HI
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> LO
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Mode Switch
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/45 p-3">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_95%,rgba(148,163,184,0.08)_95%)] bg-[length:100%_48px]" />

        <div className="relative flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="relative flex min-h-10 items-center"
              >
                <div className="w-16 text-xs font-medium text-slate-300">
                  {task.name}
                </div>
                <div className="relative h-9 flex-1 overflow-hidden rounded-xl border border-white/5 bg-slate-900/35">
                  {(segmentsByTask.get(task.id) ?? []).map((segment, index) => {
                    const left = Math.max(0, xFor(segment.start));
                    const right = Math.min(100, xFor(segment.end));
                    const width = Math.max(0.4, right - left);

                    return (
                      <div
                        key={`${task.id}-${segment.start}-${index}`}
                        className={`absolute top-[5px] h-6 rounded-lg bg-gradient-to-r ${laneColor[segment.criticality]} shadow-[0_6px_14px_rgba(0,0,0,0.35)]`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          opacity: 0.95,
                        }}
                        title={`${segment.taskName} ${segment.start}-${segment.end} ms`}
                      />
                    );
                  })}

                  {visibleModeSwitches.map((marker, index) => (
                    <div
                      key={`${task.id}-${marker.time}-${index}`}
                      className="pointer-events-none absolute inset-y-0 z-10"
                      style={{
                        left: `${Math.min(100, Math.max(0, xFor(marker.time)))}%`,
                      }}
                    >
                      <div className="h-full border-l-2 border-red-400/90" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-7 text-[11px] text-slate-400">
            {tickTimes.map((tick, index) => (
              <span
                key={`${tick}-${index}`}
                className={index === AXIS_TICKS ? "text-right" : "text-left"}
              >
                {formatTimelineTime(tick)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
