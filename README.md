# Employee_performance

## Existing Task API Contract (Before Workflow Upgrade)

The connected backend currently exposes these task endpoints:

| Endpoint | Current behavior |
| --- | --- |
| `POST /tasks` | Manager assigns a task with `employee_id`, `title`, `description`, and `due_date`. Returns `task_id` and `employee_id`. |
| `GET /my-tasks` | Employee-only. Returns `{ "tasks": { "assigned": [], "in_progress": [], "completed": [], "approved": [], "rejected": [] }, "totalCredits": 0 }`. Each grouped task is a raw `tasks` row; the endpoint selects only rows for the authenticated employee. |
| `PATCH /tasks/:id/status` | Employee changes `assigned` to `in_progress` or `in_progress` to legacy `completed`. |
| `POST /tasks/:id/submit-work` | Employee submits `work_title`, `work_description`, `work`, `work_date`, `work_time`, and `work_duration`; the fields are stored on `tasks`, and status becomes `completed`. |
| `GET /team-tasks/pending-review` | Manager-only. Returns tasks assigned by that manager whose status is `completed`, with employee name. |
| `PATCH /tasks/:id/review` | Manager-only. Requires `decision` and `quality_rating`; approval also requires integer `credit_rating` from 1 to 5. It updates the task and calculates credits from the employee's latest performance score. |

The live MySQL `tasks.status` enum was `assigned`, `in_progress`, `completed`, `approved`, and `rejected`. Submission content was stored on `tasks`; there was no `task_submissions`, credit-ledger, notification, or audit-log table. The directory has department data but no explicit manager/team mapping.

## Task Workflow API Contract

The backend upgrades the legacy schema additively at startup. `completed` remains in the database enum for compatibility, existing `completed` tasks are migrated to `submitted`, and legacy submission fields are copied into `task_submissions` only when a submission timestamp exists. The canonical API statuses are `assigned`, `in_progress`, `submitted`, `approved`, and `rejected`.

| Endpoint | Contract |
| --- | --- |
| `GET /my-tasks` | Employee-only. Returns `{ "success": true, "tasks": [...], "totalCredits": 0 }`. `tasks` is a flat list of the employee's own task rows, including `assigned_by_name`, `priority`, `due_date`, canonical `status`, and `submissions` history (`submission_description`, `submission_link`, `status`, review comment, and timestamps). |
| `POST /tasks` | Manager-only. Body: `{ "employee_id", "title", "description", "due_date", "priority" }`, where priority is `low`, `medium`, `high`, or `critical`. Manager and employee must share a department in `employee_directory`; the selected user must have the employee role. Returns `{ "success": true, "task": {...} }`. |
| `PUT /api/tasks/:id/start` | Employee-only. Starts an owned `assigned` task or resumes an owned `rejected` task; returns the task ID and `in_progress` status. |
| `POST /api/tasks/:id/submit` | Employee-only. Body: `{ "submission_description", "submission_link?" }`; returns task ID, `submitted` status, and the saved submission ID. Each resubmission adds history to the same task. |
| `GET /team-tasks/pending-review` | Manager-only. Returns only that manager's `submitted` tasks, including employee identity, latest submission content/link, priority, and deadline. |
| `POST /api/tasks/:id/review` | Manager-only. Body: `{ "decision": "approved", "credit_rating": 1..5, "comment?" }` or `{ "decision": "rejected", "comment": "required" }`. The backend validates ownership, status, and transition; approval, credit-ledger entry, performance update, notification, and audit records commit together. |
| `GET /tasks/:id/work/download` | Employee or assigning manager; downloads an XLSX task report when saved submission content exists. The Employee My Work table and Manager Task Review details show **Download Excel** for valid submissions. |
| `GET /api/credits/my` | Employee-only. Returns ledger-derived `balance` and recent credit `transactions`; there is no frontend-writable balance field. |
| `GET /api/notifications/my` | Returns notifications for the authenticated user. `PATCH /api/notifications/:id/read` marks only that user's notification read. |

Assignment, start, submit, review, notification, audit, and credit-ledger writes use MySQL. On upgrade, approved tasks with existing non-null `credits_earned` are copied into the ledger idempotently, so employee credit history agrees with task totals without changing original task data. Manager team membership uses the directory's department as the permitted-team boundary because the schema has no explicit manager/team relation.

## Self Evaluation and Performance Review

The review upgrade creates `self_evaluations`, `manager_reviews`, and a singleton `performance_weights` row. The seeded policy is Task `0.40`, KPI `0.40`, Manager `0.20`; backend reads these weights and validates that they sum to 1. Existing `employee_directory.performance_score` values are on a 1–5 scale and are normalized to 0–100 for KPI achievement. Task score is approved tasks divided by all assigned tasks. Manager rating is entered from 0–100. The overall score and classification are calculated only by the backend.

| Endpoint | Contract |
| --- | --- |
| `GET /api/reviews/self` | Employee-only; returns the authenticated employee's current-period evaluation or `null`. |
| `POST /api/reviews/self` | Employee-only; saves `major_achievements`, `strengths`, `challenges`, `goals`, `kpi_progress`, `additional_comments`, and `action` (`draft` or `submit`). Submitted evaluations are final. Submission notifies department managers and writes audit events. |
| `GET /api/reviews/manager/team` | Manager-only; returns current department team, task/KPI scores, evaluation status, current score, and review status. |
| `GET /api/reviews/manager/:employeeId` | Manager-only; returns employee details, evaluation, task list, performance history, and previous manager reviews, only for same-department team members. |
| `POST /api/reviews/manager` | Manager-only; body includes `employee_id`, `manager_rating` (0–100), strengths, improvement areas, recommendations, and comments. Requires submitted self evaluation. Review, performance calculation, notification, and audit records share one transaction. |
| `GET /api/reviews/performance/my` | Employee-only; returns official score, classification, component scores, historical rows, weights, and manager feedback. |
| `POST /api/appeals` | Employee-only; accepts `monthly_performance_id`, `reason`, and optional `evidence`. The backend sets `current_level` to `manager`, blocks duplicates, and notifies/audits the event. |

The additive startup migration updates a single-row `performance_weights` configuration idempotently; it does not create duplicate weight records. The appeals table gains `evidence` and `current_level` columns. Senior-authority review rejects appeals that have not reached its level. Full manager-to-officer-to-senior-to-board escalation is not implemented yet.

The login page includes Employee, Manager, Performance Officer, Senior Authority, Appeal Board, and Admin/HR role choices. Backend authentication still requires a matching user account with that database role; the application does not seed demo Officer, Board, or Admin accounts.

## Vanilla Frontend

The plain HTML frontend is served without a framework or component library:

```powershell
cd frontend
npm start
```

Open `http://127.0.0.1:5173/login.html`. The API remains at `http://localhost:3000`. Static pages use `fetch`, the existing JWT login endpoint, and backend role checks. The verified React source and Vite build stack have been removed.