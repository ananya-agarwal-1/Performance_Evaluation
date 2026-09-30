-- Employee Performance System work-submission schema.
-- The server also creates/checks these structures automatically at startup.

CREATE TABLE IF NOT EXISTS employee_work (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    work_date DATE NOT NULL,
    hours_spent DECIMAL(5,2) NULL,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    review_notes TEXT NULL,
    credits_earned DECIMAL(5,2) DEFAULT 0,
    reviewed_by VARCHAR(50) NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tasks
    ADD COLUMN submitted_work_title VARCHAR(255) NULL,
    ADD COLUMN submitted_work_description TEXT NULL,
    ADD COLUMN submitted_work TEXT NULL,
    ADD COLUMN work_date DATE NULL,
    ADD COLUMN work_time TIME NULL,
    ADD COLUMN work_duration VARCHAR(100) NULL,
    ADD COLUMN work_submitted_at DATETIME NULL;
