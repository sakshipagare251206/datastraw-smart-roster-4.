# Approach & Architecture

RosterOS treats roster planning as a constraint and data-modeling problem. It stores people, pods, brands, processes, assignments, per-process operating rules, holidays and dated unavailability as normalized relational data. Monthly schedules and their process assignments are persisted separately so a manager can inspect and adjust a generated plan.

The React/Vite client provides the operational dashboard and the five requested roster perspectives. Express owns all data mutations. SQLite is used for a portable assessment deployment, with foreign keys and WAL enabled. The scheduling engine expands the selected month into dates, filters employees against process calendars and hard availability blocks, respects individual weekly offs, and creates at most one shift per employee/date. A separate validator compares staffed people against each process minimum for every date the rule operates.

The engine deliberately does not fabricate backup employees or silently override leave/weekly offs. It returns a draft roster with explicit gaps, allowing the operations manager to add a resource, change a valid assignment or revise the client rule. A post-generation leave or unavailability event updates the persisted shift and immediately re-runs validation.

**Trade-off:** the first version uses deterministic eligibility filtering rather than a full constraint optimizer. This is explainable and adequate for the supplied sample. A production-scale iteration should add an optimizer for fairness, consecutive-day limits, skills, shift windows and preference balancing, plus audit history, role-based access and PostgreSQL.
