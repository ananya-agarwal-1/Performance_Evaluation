-- Optional reference migration for the advanced EPMS workflow.
-- The Node server creates these tables automatically at startup.
-- Keep this file for documentation/manual database setup.

CREATE TABLE IF NOT EXISTS manager_employee_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  manager_id VARCHAR(50) NOT NULL,
  employee_id VARCHAR(50) NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by VARCHAR(50) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY manager_employee_unique (manager_id, employee_id),
  INDEX manager_idx (manager_id, active),
  INDEX employee_idx (employee_id, active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS work_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_reference VARCHAR(30) NOT NULL UNIQUE,
  employee_id VARCHAR(50) NOT NULL,
  assigned_by VARCHAR(50) NULL,
  work_source ENUM('assigned','self_submitted') NOT NULL DEFAULT 'self_submitted',
  work_type VARCHAR(60) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  work_date DATE NOT NULL,
  hours_spent DECIMAL(6,2) NULL,
  priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  deadline DATETIME NULL,
  status ENUM('draft','submitted','under_review','approved','rejected','disputed','appealed','closed') NOT NULL DEFAULT 'draft',
  review_due_at DATETIME NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  reviewed_by VARCHAR(50) NULL,
  review_notes TEXT NULL,
  credit_rating TINYINT NULL,
  credits_earned DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX work_employee_idx (employee_id, created_at),
  INDEX work_status_idx (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS work_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_id INT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(120) NOT NULL UNIQUE,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_by VARCHAR(50) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX work_file_idx (work_id, uploaded_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS work_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_id INT NOT NULL,
  reviewer_id VARCHAR(50) NOT NULL,
  reviewer_role VARCHAR(40) NOT NULL,
  decision ENUM('approved','rejected','needs_revision') NOT NULL,
  credit_rating TINYINT NULL,
  credits_earned DECIMAL(8,2) NOT NULL DEFAULT 0,
  comments TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX work_review_idx (work_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS work_credit_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(50) NOT NULL,
  work_id INT NOT NULL,
  amount DECIMAL(8,2) NOT NULL,
  transaction_type ENUM('work_approved','credit_adjustment','appeal_adjustment','credit_reversal') NOT NULL,
  previous_amount DECIMAL(8,2) NULL,
  new_amount DECIMAL(8,2) NULL,
  reason VARCHAR(500) NULL,
  actor_id VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX credit_employee_idx (employee_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS performance_appeals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appeal_reference VARCHAR(30) NOT NULL UNIQUE,
  employee_id VARCHAR(50) NOT NULL,
  work_id INT NULL,
  appeal_type ENUM('work_rejection','low_credit','performance_score','incorrect_attribution','other') NOT NULL DEFAULT 'other',
  reason TEXT NOT NULL,
  requested_credit TINYINT NULL,
  status ENUM('submitted','under_manager_review','manager_upheld','manager_overturned','escalated','under_senior_review','senior_upheld','senior_overturned','escalated_to_board','under_board_review','approved','rejected','closed') NOT NULL DEFAULT 'submitted',
  current_level ENUM('manager','senior_authority','board') NOT NULL DEFAULT 'manager',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  INDEX appeal_employee_idx (employee_id, created_at),
  INDEX appeal_level_idx (current_level, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appeal_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  appeal_id INT NOT NULL,
  actor_id VARCHAR(50) NOT NULL,
  actor_role VARCHAR(40) NOT NULL,
  action VARCHAR(50) NOT NULL,
  decision VARCHAR(50) NULL,
  comments TEXT NULL,
  old_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX appeal_history_idx (appeal_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appeal_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appeal_id INT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(120) NOT NULL UNIQUE,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_by VARCHAR(50) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX appeal_file_idx (appeal_id, uploaded_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS review_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(50) NULL,
  manager_id VARCHAR(50) NULL,
  alert_type VARCHAR(80) NOT NULL,
  description VARCHAR(500) NOT NULL,
  severity ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  entity_type VARCHAR(50) NULL,
  entity_id INT NULL,
  status ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX alert_status_idx (status, created_at)
) ENGINE=InnoDB;
