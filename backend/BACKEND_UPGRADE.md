# EPMS Backend Upgrade

This backend keeps the existing Node.js + Express + MySQL + JWT stack and adds a work-evidence and multi-level appeal workflow without redesigning the frontend.

## Active workflow

Employee -> Work + Evidence -> Manager Review -> Credits/Performance -> Appeal -> Senior Authority -> Appeal Board

Self-evaluation is no longer an active employee workflow. Historical self-evaluation records are preserved, but new employee self-evaluation submissions return HTTP 410.

## New tables

- manager_employee_assignments
- work_items
- work_files
- work_reviews
- work_credit_transactions
- performance_appeals
- appeal_history
- appeal_files
- review_alerts

## New APIs

### Employee work
- POST /api/work
- GET /api/work/my
- GET /api/work/:id
- POST /api/work/:id/files
- POST /api/work/:id/submit
- GET /api/work/:id/files/:fileId/download

### Manager
- GET /api/manager/employees
- POST /api/manager/employees/:employeeId/assign
- POST /api/manager/work
- GET /api/manager/work/pending
- POST /api/manager/work/:id/review
- GET /api/manager/appeals
- PATCH /api/manager/appeals/:id/resolve

### Senior Authority
- GET /api/senior/appeals
- PATCH /api/senior/appeals/:id/resolve

### Appeal Board
- GET /api/board/appeals
- PATCH /api/board/appeals/:id/resolve

### Appeals
- POST /api/performance-appeals
- GET /api/performance-appeals/my
- POST /api/performance-appeals/:id/files
- GET /api/performance-appeals/:id/files/:fileId/download

### Reports
- GET /api/performance-officer/work
- GET /api/performance-officer/alerts
- GET /api/reports/work-contributions
- GET /api/reports/appeals

## File upload format

For now the backend intentionally avoids adding a frontend upload framework. The upload endpoints accept JSON like:

{
  "file": {
    "original_filename": "project-report.pdf",
    "mime_type": "application/pdf",
    "data": "data:application/pdf;base64,..."
  }
}

Allowed file types: PDF, PPT, PPTX, DOC, DOCX, XLS, XLSX, CSV, ZIP, PNG, JPG, JPEG.

Default maximum size: 25 MB. Configure with MAX_WORK_FILE_SIZE_MB.

Files are stored under backend/uploads/work and are not served as public static files.

## Performance

The performance service now counts approved legacy tasks plus approved work_items for the work/task component. The configured policy remains 40% work/task + 40% KPI + 20% manager rating.

## Start

From backend:

npm install
node server.js

No frontend changes are required to start the backend. The existing frontend can continue running while the new APIs are integrated later.
