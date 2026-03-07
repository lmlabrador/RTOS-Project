import { motion } from "framer-motion";
import { useMemo } from "react";
import { useSchedulerStore } from "../store/schedulerStore";

const eventClassMap = {
  release: "text-blue-200",
  completion: "text-emerald-200",
  deadline_miss: "text-amber-200",
  mode_switch: "text-red-200",
  suspension: "text-violet-200",
};

export function EventLog() {
  const events = useSchedulerStore((state) => state.events);

  const recentEvents = useMemo(
    () => [...events].slice(-120).reverse(),
    [events],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 }}
      className="glass-card mt-3 flex min-h-0 flex-1 flex-col p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-50">
          Event Log
        </h2>
        <span className="text-xs text-slate-400">{events.length} events</span>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-auto rounded-2xl border border-white/10 bg-slate-950/35 p-2">
        {recentEvents.length === 0 ? (
          <p className="px-2 py-2 text-sm text-slate-400">
            No simulation events yet.
          </p>
        ) : (
          recentEvents.map((event) => (
            <div
              key={event.id}
              className="rounded-xl border border-white/5 bg-white/[0.03] px-2 py-1.5 text-sm"
            >
              <span className="mr-2 text-slate-400">{event.time} ms</span>
              <span className={eventClassMap[event.type]}>{event.message}</span>
            </div>
          ))
        )}
      </div>
    </motion.section>
  );
}
