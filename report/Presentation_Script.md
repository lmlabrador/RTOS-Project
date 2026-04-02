# TickFlow – Presentation Script
**Target time: 7–8 minutes for slides 1–13. Slides 14–15 are backup for Q&A only.**

---

## Slide 1 — Title
*[Advance to slide, pause briefly, look at the audience]*

"Good [morning/afternoon]. My project is called **TickFlow** — a web-based simulator for mixed-criticality real-time scheduling.

The core idea is this: in safety-critical systems, not all tasks are created equal. TickFlow lets you configure a task set, run a live simulation, and actually *watch* what happens when the scheduler has to make hard decisions about which tasks to sacrifice. I'll walk through the problem it solves, how it works under the hood, and what the results showed."

*[~20 seconds]*

---

## Slide 2 — Problem Statement
*[Point to left card first, then right]*

"The fundamental problem is that modern safety-critical systems — things like avionics, automotive controllers, medical devices — need to run tasks of completely different importance on the same processor.

Think about it: a collision-avoidance routine and a cabin temperature display share one CPU. A missed deadline on the collision avoidance is catastrophic. A missed frame on the display is annoying at worst.

The problem with traditional RTOS schedulers is that they treat both tasks the same. There's no runtime mechanism to say 'this one matters more.'

And on the tooling side — the existing simulators like Cheddar and MAST are desktop tools, require installation, and none of them give you an interactive, live view of mode switching behavior. That's the gap TickFlow fills."

*[~45 seconds]*

---

## Slide 3 — Motivation & Objectives
*[Point to left card — industry motivation]*

"The motivation goes beyond academics. Standards like ARINC 653 in avionics and AUTOSAR in automotive explicitly require mixed-criticality task management. And because of size, weight, and power constraints — what the industry calls SWaP — you can't just throw more hardware at the problem. You have to co-host tasks of different safety levels on the same chip.

*[Point to right card — objectives]*

So the five objectives were: faithfully implement the Vestal mixed-criticality model, provide real-time visualization with a Gantt chart and event log, implement Response Time Analysis for formal schedulability checking, build an optimization engine for priority assignment, and validate everything against established scheduling theory."

*[~40 seconds]*

---

## Slide 4 — RTOS Concepts: Mixed-Criticality Scheduling
*[This is a theory slide — take your time]*

"Let me briefly cover the theoretical model the simulator is based on.

In Vestal's 2007 mixed-criticality model, each task is assigned one of two criticality levels — LO or HI. HI-criticality tasks carry *two* WCET estimates: C-LO, which is the optimistic safe bound, and C-HI, the true worst case.

*[Point to right card — the two modes]*

The system runs in LO mode by default. During LO mode, HI tasks execute using only their C-LO budget. This keeps utilization high because we're being optimistic.

But if a HI task actually runs past its C-LO budget — meaning it's exhibiting worst-case behavior — the system switches to HI mode. In HI mode, LO tasks are immediately suspended to free up the processor for safety-critical work.

The key insight here is: **sacrificing LO tasks is the safety mechanism, not a failure.** It's a deliberate design decision."

*[~50 seconds]*

---

## Slide 5 — RTOS Concepts: Scheduling & Analysis
*[Left card — FPPS, middle — RTA formula, right — TCB]*

"The scheduling policy I implemented is Fixed-Priority Preemptive Scheduling. The highest-priority ready task always runs and can preempt anything below it. I chose this over EDF because it's what safety-critical standards actually mandate — the behavior is predictable and auditable.

*[Point to RTA formula in middle card]*

For formal analysis, I implemented Response Time Analysis. This formula computes the worst-case response time for each task by iterating until it converges. If R-i is less than or equal to D-i, the task is schedulable.

*[Point to right card — TCB]*

And importantly — as specified in the project proposal — the task control block was extended beyond the standard period, deadline, and priority fields to include the criticality level, the C-LO budget, and the C-HI budget. In the code this is the `TaskModel` interface."

*[~45 seconds]*

---

## Slide 6 — System Architecture
*[Point to the architecture diagram layers top to bottom]*

"The architecture has three strict layers.

At the bottom is the **simulation engine** — `SchedulerEngine`, `SimulationClock`, and `TaskModel`. This is pure scheduling logic with zero UI dependencies. It's deterministic and testable in isolation.

In the middle is the **Zustand state store**, which manages all mutable simulation state and mediates between the engine and the UI. Every tick, the engine produces a snapshot and the store broadcasts it.

At the top are the **React components** — the Gantt chart, event log, status panel, and report modal — which re-render reactively whenever state changes.

*[Point to tech stack card]*

The tech stack is React 19 with TypeScript, Zustand for state, and Vite as the build tool. The key design decision here was **strict separation of concerns** — the scheduler engine doesn't know anything about React, which made it very easy to test and swap out pieces independently."

*[~45 seconds]*

---

## Slide 7 — Key Implementation Challenges
*[Walk through each card]*

"There were four non-trivial challenges.

**First, mode switch timing.** The simulation runs in discrete ticks — 1, 2, or 5 milliseconds. I needed to detect the exact moment a HI task crossed its C-LO budget within a tick. The solution was to check `executedTime > wcetLo` after every tick increment, so the maximum detection latency is bounded by the tick size.

**Second, memory bounds.** A long simulation generates thousands of events and Gantt segments. I capped these with circular buffers — 400 events, 1800 segments — so the heap footprint stays under 400 kilobytes regardless of how long the sim runs.

**Third, RTA convergence.** For unschedulable task sets, the iterative formula diverges. I enforced a 100-iteration limit and mark those tasks as FAILED in the report.

**Fourth, browser timer jitter.** `setInterval` isn't real-time — callbacks drift under CPU load. The fix was to base all scheduling decisions on simulation time, not wall-clock time. Wall-clock only determines how fast the UI updates."

*[~50 seconds]*

---

## Slide 8 — Implementation: Key Solutions
*[Left — step function code, right — sampling and scoring]*

"Here's the core of the scheduler. Every tick, the `step()` function does four things in order: advance time, release any jobs whose period has elapsed, check for deadline misses, then select and execute the highest-priority ready job.

*[Trace through the mode switch check in the code]*

The mode switch check is right here — after executing the job for one tick, if we're in LO mode and the running task is HI and its executed time has crossed wcetLo, `triggerModeSwitch` fires immediately.

*[Point to right card — sampling]*

On the right is the execution budget sampling. When a HI task's job is released, there's a 35% probability its budget is sampled above wcetLo, simulating realistic non-deterministic execution. This is what actually triggers mode switches during simulation.

And below that is the optimization scoring formula — it penalizes utilization overruns heavily, HI-task deadline failures more than LO, and minimizes configuration changes."

*[~50 seconds]*

---

## Slide 9 — Results: Schedulability Analysis
*[Left — task table and RTA results, right — utilization bars]*

"Now for results. Experiment one was schedulability validation.

*[Point to task table]*

The default task set has three tasks: T1 and T3 are HI-criticality, T2 is LO. I ran Response Time Analysis manually and verified the simulator's output matches.

*[Walk through RTA results table]*

In LO mode, all three tasks pass: T1 responds in 20ms against a 100ms deadline, T2 in 38ms against 80ms, T3 in 63ms against 150ms. In HI mode with only the two HI tasks, both pass as well — T3's worst case is 90ms against its 150ms deadline. Five out of five.

*[Point to utilization bars]*

The utilization numbers are 59.2% in LO mode and 73.3% in HI mode — both safely below the RMS schedulability bound of 78% for three tasks. So the system is formally verified schedulable in both modes."

*[~50 seconds]*

---

## Slide 10 — Results: Live Simulation Demo
*[Point to Gantt chart, then event log, then status panel]*

"Experiment two was observing LO-task impact during mode switching — which is the core behavior the proposal asked us to demonstrate.

*[Point to Gantt chart]*

This is the Gantt chart output. You can see T1 and T3 in blue executing across their periods. The red vertical line is a mode switch event. Notice T2 in grey — it executes during LO mode, then the moment that mode switch fires, T2's bar stops. It never resumes.

*[Point to event log]*

The event log shows exactly what happened: T2 released, T2 completed, a few cycles later — mode switch to HI, T2 suspended. Clean, timestamped, and color-coded.

*[Point to KPIs]*

Over a full 1200-millisecond hyperperiod, zero deadline misses on HI tasks, approximately seven mode switches — which matches the theoretical prediction of 20 HI-task jobs times 35% overrun rate.

The optimization report confirmed the default priority assignment of 1, 2, 3 is already optimal — scoring zero — meaning no changes were recommended."

*[~55 seconds]*

---

## Slide 11 — Learning Outcomes Reflection
*[Walk left to right across the three cards]*

"This project explicitly targets LO1, LO3, and LO4 from the course.

**LO1 — real-time scheduling policies.** I implemented FPPS with both RMS and DMS priority assignment and ran RTA across four different priority configurations. The clearest takeaway was that DMS strictly dominates RMS for constrained-deadline task sets — something that's easy to accept on paper but becomes obvious when you watch the optimizer consistently prefer DMS.

*[Point to middle card — LO3]*

**LO3 — concurrency and priority inversion.** FPPS inherently prevents priority inversion because the highest-priority ready job always runs. In a mixed-criticality context this matters even more — a HI task being delayed by a LO task is a safety violation. The mode-switch mechanism resolves this definitively: the moment a HI task overruns, every LO job is pulled off the ready queue immediately, so there is no possible LO-induced blocking in HI mode.

*[Point to right card — LO4]*

**LO4 — kernel architectures.** Monolithic kernels like FreeRTOS run the scheduler, drivers, and application in one address space — fast context switches, but no fault isolation between tasks. Microkernels like QNX or seL4 isolate everything into separate partitions — which is exactly what safety certifications like DO-178C and ISO 26262 require. TickFlow's mode-switch is the conceptual equivalent of that criticality partitioning, just implemented in software rather than enforced by hardware privilege levels."

*[~55 seconds]*

---

## Slide 12 — Challenges & Lessons Learned
*[Left side — technical, right — design lessons]*

"The most significant technical challenge was the absence of mode recovery. Once the system switches to HI mode, it stays there. A real production system needs a formal recovery protocol to safely re-admit LO tasks — but that's an open research problem involving cross-mode schedulability analysis that was out of scope for this project.

*[Point to design lessons]*

The design lesson I'd carry forward is how much the architectural separation paid off. Because the scheduler engine has zero UI dependencies, I could iterate on the optimization algorithm and RTA implementation without ever touching a React component. That independence was worth the upfront design cost.

*[Point to right card — what I'd do differently]*

If I were extending this, the highest-value addition would be EDF scheduling as a comparison baseline, and Monte Carlo simulation over many hyperperiods for statistical schedulability analysis — because a single hyperperiod run is a sample, not a proof."

*[~45 seconds]*

---

## Slide 13 — Conclusion & Future Work
*[Left card — summary, then right cards]*

"To wrap up: TickFlow implements the Vestal mixed-criticality model with fixed-priority preemptive scheduling, live visualization, and formal Response Time Analysis. The default task set is verified schedulable in both modes, mode switching works correctly, and the optimization engine confirms the default priority assignment is optimal.

*[Point to recommendations]*

Three practical takeaways: always verify schedulability with RTA before you trust a task set — intuition is unreliable. Choose WCET budgets conservatively — the simulation showed that a 35% overrun rate drives seven mode switches per hyperperiod, which completely starves LO tasks. And use Deadline Monotonic over Rate Monotonic whenever tasks have constrained deadlines.

*[Point to future work]*

The obvious next steps are mode recovery, EDF support, and exporting task sets to FreeRTOS configuration files for physical hardware validation — closing the loop between simulation and deployment.

That's TickFlow. Happy to take questions."

*[~45 seconds]*

---

## Slide 14 & 15 — Backup (Q&A only, do not present proactively)

**If asked: "Why not EDF?"**
> "EDF achieves 100% utilization theoretically, but safety-critical standards like ARINC 653 and AUTOSAR mandate fixed priorities because the behavior is auditable — you can certify exactly which task runs when. EDF's behavior under overload is also unpredictable. With FPPS, you know lower-priority tasks fail first. That predictability matters more than squeezing out the last few percent of utilization."

**If asked: "Why no mode recovery?"**
> "Mode recovery is genuinely hard. Naively re-admitting LO tasks after a HI event can violate HI-task deadlines during the transition window. Baruah's 2011 work describes formal recovery protocols, but implementing them correctly requires cross-mode schedulability analysis. I scoped it out deliberately to keep the model tractable and the implementation verifiable."

**If asked: "How realistic is the 35% overrun model?"**
> "It's pedagogical, not empirical. Real WCET analysis uses static analysis tools or measurement-based bounds. The 35% figure was chosen to make mode switches observable within a short simulation run. The qualitative lesson — that overrun probability directly impacts LO-task throughput — holds regardless of the exact number."

**If asked: "Does it scale to more tasks?"**
> "Yes. The engine is O(n) per tick for n tasks. RTA is O(n²) per analysis run. Circular buffers bound memory regardless of task count. I tested up to ten tasks without any noticeable performance degradation."

---

## Timing Guide

| Slides | Content | Target Time |
|---|---|---|
| 1 | Title | 20s |
| 2–3 | Problem + Motivation | 1m 25s |
| 4–5 | Theory | 1m 35s |
| 6 | Architecture | 45s |
| 7–8 | Implementation | 1m 40s |
| 9–10 | Results | 1m 45s |
| 11–12 | Reflection + Lessons | 1m 35s |
| 13 | Conclusion | 45s |
| **Total** | | **~9m 30s** |

*Trim slides 7–8 to one card each if running over 8 minutes.*
