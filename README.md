# Employee Performance Management System (EPMS)

This version keeps the frontend intentionally minimal (HTML/CSS/Vanilla JS) and focuses on a complete connected workflow.

## Main features

- Dataset-backed employee directory and monthly performance history
- Role-based login: Employee, Manager, Senior Authority, Performance Officer, Appeal Board, Admin
- Explicit manager-to-employee assignments
- Assigned and self-submitted work
- Mandatory evidence files before employee submission
- Secure evidence download
- SHA-256 duplicate evidence detection
- Work review, revision, rejection and approval workflow
- Immutable review and credit transaction history
- Multiple contributors
- Recognition records
- Performance history/trends
- Employee contribution timeline
- Decision acknowledgement
- Multi-level appeals: Employee → Manager → Senior Authority → Appeal Board
- Conflict-of-interest escalation
- Appeal timeline and evidence
- Notifications
- Review SLA/overdue alerts
- Live dashboards
- Employee/team/work/performance/credit/appeal reports
- Real XLSX and CSV export
- Forgot-password/reset demo workflow
- Audit events

## Setup

### 1. MySQL

Create the database configured in `backend/.env`.

Copy `.env.example` to `.env` and set:

- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`

### 2. Backend

```bash
cd backend
npm install
npm run import-data
npm run demo-users
npm start
```

Backend: `http://localhost:3000`

Health: `http://localhost:3000/api/health`

### 3. Frontend

```bash
cd frontend
npm start
```

Frontend: `http://localhost:5500`

You can also use another static HTML server.

## Demo accounts

- Manager: `manager@test.com` / `manager123`
- Senior Authority: `sm@test.com` / `sm123`
- Employee: `employee@test.com` / `employee123`
- Performance Officer: `officer@test.com` / `officer123`
- Appeal Board: `board@test.com` / `board123`
- Admin: `admin@test.com` / `admin123`

The dataset import also creates accounts such as `e1001@epms.local` using the password `Password@123` unless `DATASET_DEFAULT_PASSWORD` is set.

## Dataset

The project contains:

- `employee_profile_sample.csv` — 100 employee profiles
- `monthly_performance_sample.csv` — 1,200 monthly performance rows
- `role_mapping_reference.csv` — role mapping for the employee dataset

The import script loads all three datasets and creates manager assignments from the imported role/department data.
