import { AnimatePresence, motion } from "framer-motion";
import { useSchedulerStore } from "../store/schedulerStore";
import { type CriticalityLevel, type TaskModel } from "../engine/TaskModel";

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const updateField = (
  task: TaskModel,
  key: keyof Omit<TaskModel, "id">,
  value: string,
  updateTask: (taskId: string, updates: Partial<Omit<TaskModel, "id">>) => void,
) => {
  if (key === "name") {
    updateTask(task.id, { name: value });
    return;
  }

  if (key === "criticality") {
    const criticality = value as CriticalityLevel;
    updateTask(task.id, {
      criticality,
      wcetHi:
        criticality === "HI"
          ? (task.wcetHi ?? Math.max(task.wcetLo, task.wcetLo + 1))
          : undefined,
    });
    return;
  }

  if (key === "priority") {
    updateTask(task.id, {
      priority:
        value === ""
          ? undefined
          : toNumber(value, task.priority ?? task.period),
    });
    return;
  }

  const numericValue = toNumber(
    value,
    Number(task[key as keyof TaskModel]) || 1,
  );
  updateTask(task.id, { [key]: numericValue });
};

export function TaskTable() {
  const tasks = useSchedulerStore((state) => state.tasks);
  const updateTask = useSchedulerStore((state) => state.updateTask);
  const deleteTask = useSchedulerStore((state) => state.deleteTask);

  return (
    <div className="glass-card mt-3 flex min-h-0 min-w-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-50">
          Task Set
        </h2>
        <span className="text-xs text-slate-400">Editable in place</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-slate-900/85 backdrop-blur-sm">
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 text-left">Task</th>
              <th className="px-2 py-2 text-left">Crit</th>
              <th className="px-2 py-2 text-left">P</th>
              <th className="px-2 py-2 text-left">D</th>
              <th className="px-2 py-2 text-left">LO</th>
              <th className="px-2 py-2 text-left">HI</th>
              <th className="px-2 py-2 text-left">Prio</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {tasks.map((task) => (
                <motion.tr
                  key={task.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-white/10"
                >
                  <td className="px-3 py-2">
                    <input
                      value={task.name}
                      onChange={(event) =>
                        updateField(
                          task,
                          "name",
                          event.target.value,
                          updateTask,
                        )
                      }
                      className="table-input w-16"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={task.criticality}
                      onChange={(event) =>
                        updateField(
                          task,
                          "criticality",
                          event.target.value,
                          updateTask,
                        )
                      }
                      className="table-input w-16"
                    >
                      <option value="LO">LO</option>
                      <option value="HI">HI</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      value={task.period}
                      onChange={(event) =>
                        updateField(
                          task,
                          "period",
                          event.target.value,
                          updateTask,
                        )
                      }
                      className="table-input w-16"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      value={task.deadline}
                      onChange={(event) =>
                        updateField(
                          task,
                          "deadline",
                          event.target.value,
                          updateTask,
                        )
                      }
                      className="table-input w-16"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      value={task.wcetLo}
                      onChange={(event) =>
                        updateField(
                          task,
                          "wcetLo",
                          event.target.value,
                          updateTask,
                        )
                      }
                      className="table-input w-16"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      disabled={task.criticality === "LO"}
                      value={task.wcetHi ?? task.wcetLo}
                      onChange={(event) =>
                        updateField(
                          task,
                          "wcetHi",
                          event.target.value,
                          updateTask,
                        )
                      }
                      className="table-input w-16 disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="Auto"
                      value={task.priority ?? ""}
                      onChange={(event) =>
                        updateField(
                          task,
                          "priority",
                          event.target.value,
                          updateTask,
                        )
                      }
                      className="table-input w-16"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 transition hover:bg-rose-500/20"
                    >
                      Delete
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}
