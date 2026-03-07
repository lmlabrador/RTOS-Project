# RTOS_Project

Mixed-Criticality Scheduling Simulator built with React, TypeScript, Zustand, and Vite.

This project demonstrates Vestal-style mixed-criticality behavior with:

- Task models containing `WCET_LO` and `WCET_HI`
- LO to HI mode-switch protocol
- Priority-based scheduling with deadline and release tie-breaks
- Timeline and event log visualization
- Report modal with waveform views, formal timing checks (RTA), and optimization suggestions

## Tech Stack

- React 19
- TypeScript 5
- Zustand
- Framer Motion
- Vite 5
- Tailwind CSS

## Prerequisites

- Node.js 18+ (recommended 20+)
- npm 9+
- Git

Check versions:

```powershell
node -v
npm -v
git --version
```

## Step-By-Step Setup (Windows PowerShell)

1. Clone the repository

```powershell
git clone https://github.com/lmlabrador/RTOS-Project.git
```

2. Go to the project folder

```powershell
cd RTOS-Project
```

3. Install dependencies

```powershell
npm install
```

4. Run the development server

```powershell
npm run dev
```

5. Open the app in browser

- Vite prints a URL (usually `http://localhost:5173`)

## Step-By-Step Setup (macOS/Linux)

```bash
git clone https://github.com/lmlabrador/RTOS-Project.git
cd RTOS-Project
npm install
npm run dev
```

## Build And Preview

1. Create production build

```powershell
npm run build
```

2. Preview production build locally

```powershell
npm run preview
```

## Lint

```powershell
npm run lint
```

## How To Use The Simulator

1. Create or edit tasks in `Create Task` and `Task Set`.
2. Start simulation with `Start`.
3. Use `Pause/Continue` and `Stop/Reset` controls as needed.
4. Set optional simulation end time in controls.

- Leave empty for auto end time using task hyperperiod (LCM of periods).

5. Observe:

- `Scheduler Timeline` for execution segments and mode switches
- `System Status` for current mode, misses, lifecycle state
- `Event Log` for releases/completions/misses/suspensions

6. Open `View Report` for:

- KPI summary
- Waveforms
- Formal timing checks (RTA)
- Optimization recommendations

## Project Structure

```text
src/
  components/
    EventLog.tsx
    ReportModal.tsx
    SchedulerTimeline.tsx
    SimulationControls.tsx
    SystemStatusPanel.tsx
    TaskForm.tsx
    TaskTable.tsx
  engine/
    SchedulerEngine.ts
    SimulationClock.ts
    TaskModel.ts
  pages/
    Dashboard.tsx
  store/
    schedulerStore.ts
  styles/
    globals.css
```

## Common Issues

1. `npm` command not found

- Install Node.js from `https://nodejs.org/` and reopen terminal.

2. Port already in use

- Start on another port:

```powershell
npm run dev -- --port 5174
```

3. TypeScript or lint errors after pull

```powershell
npm install
npm run build
npm run lint
```

4. Git line-ending warnings (`LF will be replaced by CRLF`)

- This is common on Windows and usually harmless.

## Scripts

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

## Notes

- The simulator is intended for educational and project demonstration use.
- Formal checks in report are lightweight fixed-priority analyses and not a certified safety proof.
