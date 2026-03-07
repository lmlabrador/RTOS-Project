import { type FormEvent, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { type CriticalityLevel } from "../engine/TaskModel";
import { useSchedulerStore } from "../store/schedulerStore";

interface FormState {
  name: string;
  criticality: CriticalityLevel;
  period: number;
  deadline: number;
  wcetLo: number;
  wcetHi: number;
  priority: number | "";
}

const initialForm: FormState = {
  name: "T4",
  criticality: "LO",
  period: 120,
  deadline: 120,
  wcetLo: 16,
  wcetHi: 32,
  priority: "",
};

export function TaskForm() {
  const addTask = useSchedulerStore((state) => state.addTask);
  const [form, setForm] = useState<FormState>(initialForm);

  const canSubmit = useMemo(
    () => form.name.trim().length > 0 && form.period > 0 && form.deadline > 0,
    [form],
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    addTask({
      name: form.name.trim(),
      criticality: form.criticality,
      period: form.period,
      deadline: form.deadline,
      wcetLo: form.wcetLo,
      wcetHi: form.criticality === "HI" ? form.wcetHi : undefined,
      priority: form.priority === "" ? undefined : Number(form.priority),
    });

    setForm((prev) => ({
      ...initialForm,
      name: `T${Math.floor(Math.random() * 89) + 10}`,
      criticality: prev.criticality,
    }));
  };

  return (
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-card min-w-0 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-50">
          Create Task
        </h2>
        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
          Periodic Job
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="form-label col-span-2">
          Task Name
          <input
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
            className="form-input"
            placeholder="T1"
            required
          />
        </label>

        <label className="form-label">
          Criticality
          <select
            value={form.criticality}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                criticality: event.target.value as CriticalityLevel,
              }))
            }
            className="form-input"
          >
            <option value="LO">LO</option>
            <option value="HI">HI</option>
          </select>
        </label>

        <label className="form-label">
          Priority
          <input
            type="number"
            min={1}
            value={form.priority}
            onChange={(event) => {
              const value = event.target.value;
              setForm((prev) => ({
                ...prev,
                priority: value === "" ? "" : Number(value),
              }));
            }}
            className="form-input"
            placeholder="Auto"
          />
        </label>

        <label className="form-label">
          Period (ms)
          <input
            type="number"
            min={1}
            value={form.period}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                period: Number(event.target.value) || 1,
              }))
            }
            className="form-input"
            required
          />
        </label>

        <label className="form-label">
          Deadline (ms)
          <input
            type="number"
            min={1}
            value={form.deadline}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                deadline: Number(event.target.value) || 1,
              }))
            }
            className="form-input"
            required
          />
        </label>

        <label className="form-label">
          WCET_LO (ms)
          <input
            type="number"
            min={1}
            value={form.wcetLo}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                wcetLo: Number(event.target.value) || 1,
              }))
            }
            className="form-input"
            required
          />
        </label>

        <label className="form-label">
          WCET_HI (ms)
          <input
            type="number"
            min={1}
            disabled={form.criticality === "LO"}
            value={form.wcetHi}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                wcetHi: Number(event.target.value) || 1,
              }))
            }
            className="form-input disabled:opacity-40"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-3 w-full rounded-2xl border border-blue-300/30 bg-gradient-to-r from-blue-500/80 to-violet-500/80 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_rgba(59,130,246,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Add Task
      </button>
    </motion.form>
  );
}
