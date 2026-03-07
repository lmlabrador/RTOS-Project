import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useSchedulerStore } from "../store/schedulerStore";

const speedValues = [1, 2, 5];
const tickValues = [1, 2, 5];

export function SimulationControls() {
  const isRunning = useSchedulerStore((state) => state.isRunning);
  const isCompleted = useSchedulerStore((state) => state.isCompleted);
  const time = useSchedulerStore((state) => state.time);
  const speed = useSchedulerStore((state) => state.speed);
  const tickSize = useSchedulerStore((state) => state.tickSize);
  const simulationEndTime = useSchedulerStore(
    (state) => state.simulationEndTime,
  );
  const startSimulation = useSchedulerStore((state) => state.startSimulation);
  const stopSimulation = useSchedulerStore((state) => state.stopSimulation);
  const pauseSimulation = useSchedulerStore((state) => state.pauseSimulation);
  const resetSimulation = useSchedulerStore((state) => state.resetSimulation);
  const setSpeed = useSchedulerStore((state) => state.setSpeed);
  const setTickSize = useSchedulerStore((state) => state.setTickSize);
  const setSimulationEndTime = useSchedulerStore(
    (state) => state.setSimulationEndTime,
  );

  const [endTimeInput, setEndTimeInput] = useState(
    simulationEndTime === null ? "" : String(simulationEndTime),
  );

  useEffect(() => {
    setEndTimeInput(
      simulationEndTime === null ? "" : String(simulationEndTime),
    );
  }, [simulationEndTime]);

  const hasStarted = time > 0 || isCompleted;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.08 }}
      className="glass-card mb-3 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-50">
          Simulation Controls
        </h2>
        <span className="text-xs text-slate-400">Discrete Tick Scheduler</span>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={hasStarted || isRunning ? stopSimulation : startSimulation}
          className="control-btn control-btn-primary"
        >
          {hasStarted || isRunning ? "Stop" : "Start"}
        </button>
        <button
          onClick={isRunning ? pauseSimulation : startSimulation}
          disabled={isCompleted || (!isRunning && !hasStarted)}
          className="control-btn"
        >
          {isRunning ? "Pause" : "Continue"}
        </button>
        <button onClick={resetSimulation} className="control-btn">
          Reset
        </button>
      </div>

      <div className="mb-4">
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">
          End Of Simulation
        </p>
        <label className="form-label">
          Optional End Time (ms)
          <input
            type="number"
            min={500}
            value={endTimeInput}
            onChange={(event) => setEndTimeInput(event.target.value)}
            onBlur={() => {
              const value = endTimeInput.trim();

              if (value === "") {
                setSimulationEndTime(null);
                return;
              }

              const parsed = Number(value);
              setSimulationEndTime(Number.isFinite(parsed) ? parsed : null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                (event.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="form-input"
            placeholder="Auto (Hyperperiod / LCM)"
          />
        </label>
        <p className="mt-1 text-[11px] text-slate-400">
          Leave empty for automatic stop at hyperperiod (LCM of task periods).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">
            Speed
          </p>
          <div className="flex gap-2">
            {speedValues.map((value) => (
              <button
                key={value}
                onClick={() => setSpeed(value)}
                className={`rounded-xl px-3 py-1.5 text-sm transition ${
                  speed === value
                    ? "border border-blue-300/50 bg-blue-500/25 text-blue-100"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">
            Tick Size
          </p>
          <div className="flex gap-2">
            {tickValues.map((value) => (
              <button
                key={value}
                onClick={() => setTickSize(value)}
                className={`rounded-xl px-3 py-1.5 text-sm transition ${
                  tickSize === value
                    ? "border border-violet-300/50 bg-violet-500/25 text-violet-100"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {value} ms
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
