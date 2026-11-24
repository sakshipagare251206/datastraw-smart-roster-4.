# RosterOS — Smart Roster Management System

A responsive workforce roster planner built for the DataStraw Tech Internship Assessment. It models employee-to-brand/process assignments, pod ownership, per-process operating calendars, availability, monthly shifts, and minimum coverage validation.

## Stack

- **Frontend:** React 18 + Vite, Lucide icons, responsive CSS.
- **API:** Node.js + Express.
- **Database:** SQLite via `better-sqlite3` (foreign keys + WAL mode). Data persists in `data/roster.sqlite`.
- **Scheduling:** deterministic rule-based generator in `server/scheduler.js`; validation is run against the same persisted roster records after generation and every manual change.

## Features

- Seeded sample workspace: 32 employees, 5 pods/pod leads, 24 brands, 5 processes, 66 employee/process allocations and process-specific rules.
- Twenty of twenty-four brands (83%) have a single dedicated owner across their configured processes. Two brands are staffed by three employees and include shared Customer Support coverage.
- Operating calendars: 365 days; daily including public holidays; daily with public holidays off; Sundays/public holidays off; weekdays only.
- Employee weekly-off day, approved leave, comp-off and unavailable dates. The preference field is persisted for future optimizer use; the first version does not override mandatory constraints based on preference.
- Month selector, generation, employee schedule grid, pod/brand/process/employee drill-downs, CSV export.
- Manual shift status edits with immediate validation.
- Adding approved unavailability during an already generated month updates the existing shift and recalculates coverage immediately.
- Configurable employees, pods, brands, processes, assignments, process rules and public holidays.
- Coverage dashboard, critical issue list, minimum staffing checks and one-shift-per-employee-per-day validation.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000/api/bootstrap

Production build and run:

```bash
npm run build
npm start
```

The Express server serves `dist/` when `NODE_ENV=production`.

## Environment

No secrets or third-party services are required. Copy `.env.example` only if you want to override the default port. SQLite is created automatically in `data/roster.sqlite` on first launch. Back up this file to preserve workspace data.

## Scheduling model and assumptions

1. A brand owns one or more process rules. A rule defines its operating calendar and minimum number of assigned people needed on every operating date.
2. Employees are assigned to one or more brand/process pairs. The same person may cover multiple assigned processes, but receives at most one shift on a date.
3. Weekly offs are individual employee settings (weekday number, Sunday = 0). They are not derived from the brand calendar.
4. Approved leave, comp-off and unavailable records are hard blocks. Public holidays affect only rules configured to close on public holidays; 365-day processes still operate; rules configured as Sundays/public holidays off or weekdays-only close on those dates.
5. The sample uses fictional people and brands. Holiday examples are demonstration data, not an authoritative Indian holiday calendar.
6. Minimum coverage is evaluated per brand/process/date, not as an aggregate brand headcount; optional weekday overrides can raise or lower the baseline minimum for a specific day.
7. The scheduler does not invent substitute staff. If all assigned people are unavailable or on weekly off, it creates the roster with a visible critical gap. Managers can add assignments or adjust a shift and validate again.
8. Shift times are stored on rules for future extension; the current sample uses one daytime shift and enforces no more than one shift per employee per date.

## The eight assessment questions

### 1. How did you model employees, brands, processes, pods, and their relationships?
Employees belong to a pod. Pods have a named lead. Brands and processes are separate entities; `assignments` is a many-to-many bridge between employee, brand and process. A `rules` row configures each brand/process operating calendar, baseline minimum staffing and optional weekday-specific staffing overrides (`{"0":2,"5":3}` where Sunday is 0). `unavailability` stores dated employee exceptions. `rosters`, `shifts`, and `shift_assignments` persist monthly plans and the responsibilities attached to each shift. Foreign keys and uniqueness constraints prevent orphaned or duplicate relationships.

### 2. How does your system generate a roster and determine whether it satisfies the required constraints?
The deterministic generator iterates every calendar date and active brand/process rule. It checks whether the process operates that date, then filters assigned employees by active status, approved unavailability and their individual weekly-off day. It writes one daily shift per employee and links the employee's configured process assignments. A separate validator compares distinct assigned employees with each rule's minimum staffing on every operating date and checks for multiple shifts per employee/day. The result includes a coverage percentage and dated critical gaps.

### 3. How did you handle the difference between single-resource brands and brands with multiple employees?
They use the same normalized assignment model. A single-resource brand has one employee assigned to all its processes; multi-resource brands have two or three employees allocated to separate or shared processes. The generator does not hard-code either structure. Coverage is determined by the actual employee/process assignments and each process's `min_staff` rule.

### 4. What happens when an employee manages all processes for a brand but is unavailable on a required working day?
An approved leave/comp-off/unavailable record blocks that employee on the selected date. If a roster already exists for that month, the existing shift is updated immediately and the validator recalculates all affected process coverage. A single-owner brand with no alternate assigned resource shows a critical gap for each required process. The manager can assign a backup employee to those processes and revalidate.

### 5. How does your system handle conflicting requirements or insufficient staffing?
Mandatory blocks (approved unavailability and weekly off) are not silently overridden. If eligible assigned staff are below minimum coverage, the roster remains a draft and validation reports the exact date, brand, process, required headcount and actual headcount. Employees are limited to one shift per date. The manager resolves the conflict by adding an assignment, changing a valid employee schedule, or updating a business rule; each edit is revalidated.

### 6. Which parts of the process did you automate, and which did you leave under human control? Why?
Calendar expansion, eligibility filtering, shift creation, coverage calculation, conflict reporting and CSV export are automated. Managers control the source data, operating rules, resource assignments, approved absence records and manual exceptions. Publishing/approval is intentionally human-controlled because operational trade-offs and client commitments need accountable review.

### 7. If the company doubled its team and brand count, what would you change about your solution?
Move SQLite to PostgreSQL, add indexes for month/date/employee/brand/process access, introduce paginated APIs and role-based access, and run generation as a background job. For larger or more constrained plans, replace the greedy deterministic allocator with an optimization model (e.g. Google OR-Tools CP-SAT) that can balance weekly-off fairness, preferences, shifts, skills and coverage. Add audit history and transactional roster versioning.

### 8. If you had one additional week to work on this, what would you improve first?
First, upgrade the generator to a constraint optimizer with explicit fairness and maximum-consecutive-day rules, plus a pre-generation feasibility report. Next, add roster approval/publish workflow, audit history, tests for edge cases, richer shift/skill modelling, and an accessible bulk-edit experience. I would also add a true database-backed user/role model before production deployment.

## Architecture note

The UI is a React single-page application. It communicates with a small Express JSON API. The API owns persistence and all scheduling mutations; the browser never decides coverage. The scheduler is isolated from route handlers so generation and validation can be tested independently. SQLite provides a portable, zero-service database for this assessment. The roster is always saved as a draft until a human reviews its coverage and resolves critical gaps.

## 3–5 minute demo walkthrough

1. **0:00–0:30 — Overview:** Show the 32-person team, 10 brands, process count, pods, roster health and conflict indicator. Explain that the seed includes the 80/20 single-owner/multi-resource pattern.
2. **0:30–1:20 — Generate:** Select November 2026 and click **Generate roster**. Explain the four operating calendars and how individual weekly offs and approved absence blocks are applied.
3. **1:20–2:10 — Views:** Open the Roster page. Show Company and Pod grids, then switch to Brand, Process and Employee views. Export the monthly CSV.
4. **2:10–3:00 — Conflict handling:** Open a shift and change its status, then show the live validation panel. Demonstrate a critical gap for a single-owner process if that employee is made unavailable on an operating day.
5. **3:00–4:00 — Post-generation change:** Open Time off, add an unavailable/leave date for a rostered employee in the selected month. The existing shift is updated and coverage recalculated immediately; show the exact brand/process/date gap. Add a backup assignment under Assignments and regenerate/review to demonstrate resolution.
6. **4:00–4:40 — Configuration:** Add a brand/process/employee or update a process rule. Emphasize that assignments and coverage requirements are data, not hard-coded brand logic.
7. **4:40–5:00 — Close:** Explain that draft status and human approval are deliberate safeguards; show README architecture and deployment setup.

## Deployment

Deploy to any Node.js host that supports persistent disk storage (Render, Railway, Fly.io or a VM):

1. Push this folder to GitHub.
2. Configure build command `npm install && npm run build`.
3. Configure start command `npm start` and `NODE_ENV=production`.
4. Attach persistent storage and set `DB_DIR` to the persistent-volume directory; by default it stores `data/roster.sqlite` relative to the project root.
5. Ensure the disk is mounted at the application path or update the database path to the platform's persistent-volume mount.
6. Open the deployed URL and verify `/api/bootstrap`, generate a month, and check that a restart preserves data.

A public URL and GitHub repository require the owner's hosting and GitHub accounts and cannot be truthfully claimed until deployed/pushed. This repository is prepared for that handoff.
