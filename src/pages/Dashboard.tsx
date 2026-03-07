import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { EventLog } from "../components/EventLog";
import { ReportModal } from "../components/ReportModal";
import { SchedulerTimeline } from "../components/SchedulerTimeline";
import { SimulationControls } from "../components/SimulationControls";
import { SystemStatusPanel } from "../components/SystemStatusPanel";
import { TaskForm } from "../components/TaskForm";
import { TaskTable } from "../components/TaskTable";
import {
  type ModeSwitchMarker,
  type SimulationEvent,
  type SystemMode,
  type TaskModel,
  type TimelineSegment,
} from "../engine/TaskModel";
import { useSchedulerStore } from "../store/schedulerStore";

interface ReportSnapshot {
  tasks: TaskModel[];
  events: SimulationEvent[];
  segments: TimelineSegment[];
  modeSwitches: ModeSwitchMarker[];
  mode: SystemMode;
  time: number;
  deadlineMissCount: number;
}

export function Dashboard() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportSnapshot, setReportSnapshot] = useState<ReportSnapshot | null>(
    null,
  );

  const tasks = useSchedulerStore((state) => state.tasks);
  const events = useSchedulerStore((state) => state.events);
  const segments = useSchedulerStore((state) => state.segments);
  const modeSwitches = useSchedulerStore((state) => state.modeSwitches);
  const mode = useSchedulerStore((state) => state.mode);
  const time = useSchedulerStore((state) => state.time);
  const deadlineMissCount = useSchedulerStore(
    (state) => state.deadlineMissCount,
  );

  const openReport = () => {
    setReportSnapshot({
      tasks: [...tasks],
      events: [...events],
      segments: [...segments],
      modeSwitches: [...modeSwitches],
      mode,
      time,
      deadlineMissCount,
    });
    setIsReportOpen(true);
  };

  return (
    <main className="relative h-screen overflow-hidden px-3 py-3 text-slate-100 md:px-5 md:py-4 lg:px-7 lg:py-4">
      <div className="bg-orb-blue" />
      <div className="bg-orb-violet" />

      <section className="relative z-10 mx-auto flex h-full max-w-[1680px] min-h-0 flex-col">
        <header className="mb-2 flex flex-none items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative grid h-8 w-8 place-items-center rounded-xl border border-white/15 bg-white/[0.05] shadow-[0_10px_24px_rgba(15,23,42,0.42)]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5.5 w-5.5 text-slate-100"
              >
                <path
                  d="M5 16.5h3.2l2-8 2.6 11 2-6H19"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-slate-50 md:text-lg">
              TickFlow
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openReport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 shadow-[0_10px_24px_rgba(6,182,212,0.16)] transition hover:bg-cyan-500/16"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M4 5.5h16M4 11.5h16M4 17.5h9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <circle
                  cx="17.5"
                  cy="17.5"
                  r="2.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
              </svg>
              View Report
            </button>

            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              aria-label="Open dashboard help"
              className="group grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/[0.05] text-slate-200 shadow-[0_10px_24px_rgba(15,23,42,0.42)] transition hover:border-cyan-200/35 hover:bg-white/[0.1]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5 transition group-hover:text-cyan-100"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M9.4 9.5a2.6 2.6 0 1 1 4.5 1.8c-.6.6-1.3 1.1-1.8 1.8-.2.3-.3.5-.3.9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="16.7" r="0.9" fill="currentColor" />
              </svg>
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden xl:grid-cols-[340px_minmax(0,1fr)_320px]">
          <aside className="hidden min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden xl:grid">
            <TaskForm />
            <TaskTable />
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <SimulationControls />
            <SchedulerTimeline />
          </section>

          <aside className="hidden min-h-0 min-w-0 flex-col overflow-hidden xl:flex">
            <SystemStatusPanel />
            <EventLog />
          </aside>

          <div className="space-y-3 xl:hidden">
            <TaskForm />
            <TaskTable />
            <SystemStatusPanel />
            <EventLog />
          </div>
        </div>
      </section>

      <AnimatePresence>
        {isHelpOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 grid place-items-center bg-slate-950/66 px-4 backdrop-blur-[14px]"
            onClick={() => setIsHelpOpen(false)}
          >
            <motion.section
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: 0.18 }}
              role="dialog"
              aria-modal="true"
              aria-label="How TickFlow works"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[640px] rounded-3xl border border-white/20 bg-slate-900/92 p-5 shadow-[0_24px_60px_rgba(2,6,23,0.7)] backdrop-blur-2xl"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Dashboard Guide
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-50">
                    How TickFlow Works
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHelpOpen(false)}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 text-xs text-slate-300 transition hover:bg-white/[0.1]"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  TickFlow simulates mixed-criticality real-time scheduling.
                  Create periodic tasks, run simulation ticks, and inspect mode
                  transitions when runtime exceeds safe low-criticality budgets.
                </p>
                <p>
                  <span className="text-slate-100">Create Task</span> and
                  <span className="text-slate-100"> Task Set</span> define the
                  workload. In the center, use
                  <span className="text-slate-100"> Simulation Controls </span>
                  to start, pause, reset, and tune speed and tick size.
                </p>
                <p>
                  <span className="text-slate-100">Scheduler Timeline</span>
                  is a live Gantt view with time on the x-axis. Blue lanes are
                  HI-criticality execution, slate lanes are LO-criticality, and
                  red markers indicate mode switches.
                </p>
                <p>
                  <span className="text-slate-100">System Status</span> and
                  <span className="text-slate-100"> Event Log</span> show
                  runtime mode, active jobs, deadline misses, and key events to
                  support schedulability analysis.
                </p>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        tasks={reportSnapshot?.tasks ?? tasks}
        events={reportSnapshot?.events ?? events}
        segments={reportSnapshot?.segments ?? segments}
        modeSwitches={reportSnapshot?.modeSwitches ?? modeSwitches}
        time={reportSnapshot?.time ?? time}
        mode={reportSnapshot?.mode ?? mode}
        deadlineMissCount={
          reportSnapshot?.deadlineMissCount ?? deadlineMissCount
        }
      />
    </main>
  );
}
