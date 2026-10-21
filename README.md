# Employee Performance Management System (EPMS)

A web-based Employee Performance Management System designed to streamline employee work tracking, task management, performance evaluation, and review workflows. The system provides a centralized platform for managing employee records, monitoring work progress, and supporting structured performance assessments.

## Overview

The Employee Performance Management System helps organizations manage employee tasks and evaluate performance through a role-based platform. It aims to improve transparency, simplify performance tracking, and maintain organized records of employee work and achievements.

## Key Features

- **Role-Based Access:** Supports different user roles, including HR/Admin, Manager, Senior Manager, and Team Employee, according to configured permissions.
- **Employee Management:** Maintains centralized employee information and profile records.
- **Task Management:** Supports task assignments, work tracking, and submission workflows.
- **Performance Evaluation:** Organizes performance information to support employee reviews and appraisals.
- **Work History:** Provides a structured view of employee work and achievements where implemented.
- **Performance Tracking:** Helps managers monitor task progress and employee contributions.
- **Review Workflows:** Supports structured review and evaluation processes.

## Technology Stack

### Frontend
- HTML5
- CSS3
- JavaScript

### Backend
- Node.js
- Express.js
- REST APIs

### Database
- MySQL

### Security and Validation
- JWT-based authentication
- Password hashing with bcryptjs
- Input validation
- CORS configuration

## Project Structure

```text
Performance_Evaluation/
├── backend/
│   ├── middleware/
│   ├── services/
│   ├── uploads/
│   ├── server.js
│   ├── db.js
│   ├── package.json
│   └── *.sql
├── frontend/
│   └── Application files
├── README.md
├── SETUP_FINAL.txt
├── SETUP_FIXED_VERSION.txt
├── employee_profile_sample.csv
├── monthly_performance_sample.csv
├── role_mapping_reference.csv
└── .gitignore
```

*Note: The structure above highlights key directories and files; the actual project may contain additional files.*

## Getting Started

### Prerequisites

Install the following before running the project:

- Node.js and npm
- MySQL Server
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/ananya-agarwal-1/Performance_Evaluation.git
cd Performance_Evaluation
```

### 2. Configure the Backend

Navigate to the backend directory:

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory using the configuration below. Replace the placeholder values with your own local configuration.

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=employee_performance_db
JWT_SECRET=your_long_random_secret
MAX_WORK_FILE_SIZE_MB=25
WORK_UPLOAD_DIR=./uploads/work
DATASET_DEFAULT_PASSWORD=change_this_password
```

**Security:** Never commit your `.env` file, database credentials, JWT secrets, or real passwords to GitHub.

### 3. Configure the Database

1. Start your MySQL server.
2. Create the database specified by `DB_NAME`.
3. Review the SQL migration files in the `backend` directory.
4. Execute the required schema and migration scripts in the order appropriate for your database.
5. Verify the database connection using the project's available database-checking scripts, if configured.

Refer to `SETUP_FINAL.txt` and `SETUP_FIXED_VERSION.txt` for project-specific setup instructions.

### 4. Start the Backend

From the `backend` directory, run:

```bash
npm start
```

The backend is configured to use the port specified in your `.env` file. With the example configuration, it should run on port `3000`.

### 5. Start the Frontend

Open a separate terminal and navigate to the frontend directory:

```bash
cd frontend
npm install
npm start
```

If the frontend dependencies are already installed, you may run `npm start` directly. The project's static server has previously been configured to serve the frontend at:

**http://localhost:5500**

Ensure the backend and MySQL server are running for features that require database access.

## Sample Data

The repository includes sample CSV files for exploring employee and performance-related data:

- `employee_profile_sample.csv`
- `monthly_performance_sample.csv`
- `role_mapping_reference.csv`

Review the files before importing them, and use only authorized, non-sensitive data.

## Security Considerations

- Keep environment variables and secrets in local `.env` files.
- Use strong, unique passwords and JWT secrets.
- Apply appropriate role-based authorization to protected routes.
- Validate and sanitize user input.
- Avoid committing private employee information or production datasets.
- Restrict access to uploaded files and sensitive employee records.

## Future Enhancements

Potential areas for further development include:

- Detailed employee achievement and work-history views
- Late-submission tracking and configurable performance-point adjustments
- Appeals and appraisal workflows
- Enhanced performance analytics and reporting
- Improved audit trails and role-specific dashboards

These are potential enhancements and should not be considered implemented unless they are available in the current codebase.

