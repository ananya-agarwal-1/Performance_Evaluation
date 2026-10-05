require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pool = require('./db');
const { verifyToken, requireRole } = require('./middleware/auth');
const {
  DEFAULT_WEIGHTS,
  getPerformanceClassification,
  getPerformanceWeights,
  normalizeKpiScore,
  recalculatePerformance
} = require('./services/performanceService');

const app = express();
app.use(cors());
app.use(express.json());

const allowedTransitions = {
  assigned: 'in_progress',
  rejected: 'in_progress'
};

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index) {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// Creates a genuine XLSX ZIP package. It uses the system `zip` command on
// macOS/Linux, with a small ZIP fallback for environments without zip.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centralParts.length, 8);
  end.writeUInt16LE(centralParts.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, end]);
}

function makeXlsx(rows, sheetName = 'Work') {
  const safeSheetName = String(sheetName).slice(0, 31).replace(/[\\/*?:\[\]]/g, '_') || 'Work';

  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${sheetRows}</sheetData></worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

  const files = {
    '[Content_Types].xml': contentTypes,
    '_rels/.rels': rootRels,
    'xl/workbook.xml': workbookXml,
    'xl/_rels/workbook.xml.rels': workbookRels,
    'xl/worksheets/sheet1.xml': sheetXml
  };

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'epms-xlsx-'));
  const packageDir = path.join(tempRoot, 'package');
  fs.mkdirSync(path.join(packageDir, 'xl', '_rels'), { recursive: true });
  fs.mkdirSync(path.join(packageDir, 'xl', 'worksheets'), { recursive: true });
  fs.mkdirSync(path.join(packageDir, '_rels'), { recursive: true });

  for (const [fileName, content] of Object.entries(files)) {
    const filePath = path.join(packageDir, fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  const outputPath = path.join(tempRoot, 'workbook.xlsx');

  try {
    execFileSync('zip', ['-q', '-r', '-X', outputPath, '.'], { cwd: packageDir });
    return fs.readFileSync(outputPath);
  } catch (zipError) {
    // Fallback for systems without the `zip` command.
    return zipStore(files);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function taskToRows(task) {
  return [
    ['Field', 'Value'],
    ['Work ID', task.id],
    ['Employee ID', task.employee_id],
    ['Employee Name', task.employee_name || ''],
    ['Assigned Work', task.title || ''],
    ['Assigned Description', task.description || ''],
    ['Submitted Work Title', task.submitted_work_title || ''],
    ['Submitted Work Description', task.submitted_work_description || ''],
    ['Work Done', task.submitted_work || ''],
    ['Work Date', task.work_date || ''],
    ['Work Time', task.work_time || ''],
    ['Duration', task.work_duration || ''],
    ['Submitted At', task.work_submitted_at || ''],
    ['Status', task.status || ''],
    ['Credit Rating', task.credit_rating ?? ''],
    ['Credits Earned', task.credits_earned ?? ''],
    ['Manager Review', task.review_notes || '']
  ];
}

function employeeWorkToRows(work) {
  return [
    ['Field', 'Value'],
    ['Work ID', work.id],
    ['Employee ID', work.employee_id],
    ['Employee Name', work.employee_name || ''],
    ['Work Title', work.title || ''],
    ['Work Description', work.description || ''],
    ['Work Date', work.work_date || ''],
    ['Hours Spent', work.hours_spent ?? ''],
    ['Status', work.status || ''],
    ['Credits Earned', work.credits_earned ?? ''],
    ['Review Notes', work.review_notes || ''],
    ['Reviewed By', work.reviewed_by || ''],
    ['Reviewed At', work.reviewed_at || ''],
    ['Submitted At', work.created_at || '']
  ];
}

function sendXlsx(res, rows, filename) {
  const buffer = makeXlsx(rows, 'Work');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}

async function ensureTaskColumns() {
  const columns = [
    ['priority', "ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium'"],
    ['submitted_work_title', 'VARCHAR(255) NULL'],
    ['submitted_work_description', 'TEXT NULL'],
    ['submitted_work', 'TEXT NULL'],
    ['work_date', 'DATE NULL'],
    ['work_time', 'TIME NULL'],
    ['work_duration', 'VARCHAR(100) NULL'],
    ['work_submitted_at', 'DATETIME NULL'],
    ['submission_link', 'VARCHAR(2048) NULL']
  ];

  for (const [columnNameValue, definition] of columns) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = ?`,
      [columnNameValue]
    );
    if (Number(rows[0].count) === 0) {
      await pool.query(`ALTER TABLE tasks ADD COLUMN ${columnNameValue} ${definition}`);
    }
  }
}

async function ensureWorkflowSchema() {
  await pool.query(`ALTER TABLE tasks MODIFY status
    ENUM('assigned','in_progress','submitted','completed','approved','rejected')
    NOT NULL DEFAULT 'assigned'`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_submissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT NOT NULL,
      employee_id VARCHAR(10) NOT NULL,
      submission_description TEXT NOT NULL,
      submission_link VARCHAR(2048) NULL,
      work_title VARCHAR(255) NULL,
      work_description TEXT NULL,
      work_details TEXT NULL,
      work_date DATE NULL,
      work_time TIME NULL,
      work_duration VARCHAR(100) NULL,
      status ENUM('submitted','approved','rejected') NOT NULL DEFAULT 'submitted',
      review_comment TEXT NULL,
      reviewed_by VARCHAR(10) NULL,
      reviewed_at DATETIME NULL,
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT task_submissions_task_fk FOREIGN KEY (task_id) REFERENCES tasks(id),
      CONSTRAINT task_submissions_employee_fk FOREIGN KEY (employee_id) REFERENCES users(employee_id),
      INDEX task_submissions_task_idx (task_id, id)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      recipient_id VARCHAR(10) NOT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      entity VARCHAR(50) NOT NULL,
      entity_id INT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX notifications_recipient_idx (recipient_id, created_at),
      CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users(employee_id)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(10) NOT NULL,
      task_id INT NOT NULL,
      amount DECIMAL(8,2) NOT NULL,
      transaction_type ENUM('task_approved') NOT NULL,
      description VARCHAR(255) NOT NULL,
      actor_id VARCHAR(10) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY credit_task_award (task_id, transaction_type),
      CONSTRAINT credit_transactions_employee_fk FOREIGN KEY (employee_id) REFERENCES users(employee_id),
      CONSTRAINT credit_transactions_task_fk FOREIGN KEY (task_id) REFERENCES tasks(id),
      CONSTRAINT credit_transactions_actor_fk FOREIGN KEY (actor_id) REFERENCES users(employee_id)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      actor_id VARCHAR(10) NOT NULL,
      action VARCHAR(40) NOT NULL,
      entity VARCHAR(50) NOT NULL,
      entity_id INT NOT NULL,
      details JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX audit_entity_idx (entity, entity_id, created_at),
      CONSTRAINT audit_actor_fk FOREIGN KEY (actor_id) REFERENCES users(employee_id)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_weights (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      task_weight DECIMAL(5,4) NOT NULL,
      kpi_weight DECIMAL(5,4) NOT NULL,
      manager_weight DECIMAL(5,4) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT performance_weights_singleton CHECK (id = 1)
    ) ENGINE=InnoDB
  `);
  // EPMS default performance policy:
  // Task Performance 40%
  // KPI Achievement 40%
  // Manager Rating 20%
  await pool.query(
    `INSERT INTO performance_weights (id, task_weight, kpi_weight, manager_weight)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE task_weight = VALUES(task_weight),
       kpi_weight = VALUES(kpi_weight), manager_weight = VALUES(manager_weight)`,
    [DEFAULT_WEIGHTS.task, DEFAULT_WEIGHTS.kpi, DEFAULT_WEIGHTS.manager]
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS self_evaluations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(10) NOT NULL,
      period VARCHAR(7) NOT NULL,
      major_achievements TEXT NULL,
      strengths TEXT NULL,
      challenges TEXT NULL,
      goals TEXT NULL,
      kpi_progress TEXT NULL,
      additional_comments TEXT NULL,
      status ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
      submitted_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY self_evaluation_period (employee_id, period),
      CONSTRAINT self_evaluations_employee_fk FOREIGN KEY (employee_id) REFERENCES users(employee_id)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS manager_reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(10) NOT NULL,
      manager_id VARCHAR(10) NOT NULL,
      period VARCHAR(7) NOT NULL,
      manager_rating DECIMAL(5,2) NOT NULL,
      strengths TEXT NULL,
      improvement_areas TEXT NULL,
      recommendations TEXT NULL,
      comments TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY manager_review_period (employee_id, period),
      CONSTRAINT manager_reviews_employee_fk FOREIGN KEY (employee_id) REFERENCES users(employee_id),
      CONSTRAINT manager_reviews_manager_fk FOREIGN KEY (manager_id) REFERENCES users(employee_id)
    ) ENGINE=InnoDB
  `);

  const appealColumns = [
    ['evidence', 'TEXT NULL'],
    ['current_level', "VARCHAR(32) NOT NULL DEFAULT 'manager'"]
  ];
  for (const [columnNameValue, definition] of appealColumns) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appeals' AND COLUMN_NAME = ?`,
      [columnNameValue]
    );
    if (Number(rows[0].count) === 0) {
      await pool.query(`ALTER TABLE appeals ADD COLUMN ${columnNameValue} ${definition}`);
    }
  }

  await pool.query(`
    INSERT INTO task_submissions
      (task_id, employee_id, submission_description, work_title, work_description,
       work_details, work_date, work_time, work_duration, status, review_comment,
       submitted_at)
    SELECT t.id, t.employee_id,
      COALESCE(NULLIF(t.submitted_work_description, ''), NULLIF(t.submitted_work, ''), 'Legacy task submission'),
      t.submitted_work_title, t.submitted_work_description, t.submitted_work,
      t.work_date, t.work_time, t.work_duration,
      CASE WHEN t.status IN ('approved','rejected') THEN t.status ELSE 'submitted' END,
      t.review_notes, COALESCE(t.work_submitted_at, t.completed_at, t.updated_at)
    FROM tasks t
    WHERE t.status IN ('completed','submitted','approved','rejected')
      AND (t.work_submitted_at IS NOT NULL OR t.submitted_work IS NOT NULL
        OR t.submitted_work_title IS NOT NULL OR t.submitted_work_description IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM task_submissions s WHERE s.task_id = t.id)
  `);
  await pool.query("UPDATE tasks SET status = 'submitted' WHERE status = 'completed'");
  await pool.query(`
    INSERT INTO credit_transactions
      (employee_id, task_id, amount, transaction_type, description, actor_id)
    SELECT employee_id, id, credits_earned, 'task_approved',
      CONCAT('Historical award for approved task: ', title), assigned_by
    FROM tasks task
    WHERE status = 'approved' AND credits_earned IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM credit_transactions transaction_row
        WHERE transaction_row.task_id = task.id
          AND transaction_row.transaction_type = 'task_approved'
      )
  `);
}

async function writeAudit(connection, actorId, action, entity, entityId, details = null) {
  await connection.query(
    'INSERT INTO audit_logs (actor_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [actorId, action, entity, entityId, details ? JSON.stringify(details) : null]
  );
}

async function createNotification(connection, recipientId, title, message, entity, entityId) {
  await connection.query(
    'INSERT INTO notifications (recipient_id, title, message, entity, entity_id) VALUES (?, ?, ?, ?, ?)',
    [recipientId, title, message, entity, entityId]
  );
}

async function getManagerEmployee(managerId, employeeId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT employee.employee_id, employee.department
     FROM employee_directory employee
     INNER JOIN users employee_user ON employee_user.employee_id = employee.employee_id
       AND employee_user.role = 'employee'
     INNER JOIN employee_directory manager ON manager.employee_id = ?
       AND manager.department = employee.department
     WHERE employee.employee_id = ? AND employee.resigned = FALSE`,
    [managerId, employeeId]
  );
  return rows[0] || null;
}

function currentPerformancePeriod() {
  return new Date().toISOString().slice(0, 7);
}

async function getEmployeeManagers(employeeId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT manager_user.employee_id
     FROM employee_directory employee
     INNER JOIN employee_directory manager ON manager.department = employee.department
     INNER JOIN users manager_user ON manager_user.employee_id = manager.employee_id
       AND manager_user.role = 'manager'
     WHERE employee.employee_id = ?`,
    [employeeId]
  );
  return rows.map((row) => row.employee_id);
}

async function ensureEmployeeWorkTable() {
  await pool.query(`
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
    )
  `);

  const columns = [
    ['credits_earned', 'DECIMAL(5,2) DEFAULT 0'],
    ['reviewed_by', 'VARCHAR(50) NULL'],
    ['reviewed_at', 'DATETIME NULL'],
    ['review_notes', 'TEXT NULL']
  ];

  for (const [columnNameValue, definition] of columns) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_work' AND COLUMN_NAME = ?`,
      [columnNameValue]
    );
    if (Number(rows[0].count) === 0) {
      await pool.query(`ALTER TABLE employee_work ADD COLUMN ${columnNameValue} ${definition}`);
    }
  }
}

// ========================= LOGIN =========================
const legacyRoleMap = {
  sm: 'senior_authority',
  senior_authority: 'senior_authority',
  employee: 'employee',
  manager: 'manager',
  performance_officer: 'performance_officer',
  board_member: 'board_member',
  admin: 'admin'
};

function normalizeRole(role) {
  if (!role) return role;
  return legacyRoleMap[role] || role;
}

async function loginHandler(req, res) {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Role, email and password are required' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = rows[0];
    const normalizedUserRole = normalizeRole(user.role);
    const normalizedRequestRole = normalizeRole(role);
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (normalizedUserRole !== normalizedRequestRole) {
      return res.status(403).json({
        message: 'These credentials are not authorized for the selected role.'
      });
    }

    const token = jwt.sign(
      { id: user.id, employee_id: user.employee_id, role: normalizedUserRole },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: { name: user.name, role: normalizedUserRole, employee_id: user.employee_id, email: user.email }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
}

app.post('/login', loginHandler);
app.post('/api/auth/login', loginHandler);

app.get('/api/auth/me', verifyToken, (req, res) => {
  res.json({ success: true, message: 'Session restored', data: { user: req.user } });
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'EPMS backend is running', database: 'connected' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database connection failed', database: 'disconnected' });
  }
});

app.get('/profile', verifyToken, (req, res) => {
  res.json({ message: 'You are logged in', user: req.user });
});

// ========================= EMPLOYEE TASKS =========================
app.get('/my-tasks', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const [rows] = await pool.query(
      `SELECT tasks.*, users.name AS assigned_by_name
       FROM tasks LEFT JOIN users ON users.employee_id = tasks.assigned_by
       WHERE tasks.employee_id = ? ORDER BY tasks.created_at DESC`,
      [employeeId]
    );

    const taskIds = rows.map((task) => task.id);
    const [submissionRows] = taskIds.length
      ? await pool.query(
        `SELECT id, task_id, submission_description, submission_link, work_date, status,
                review_comment, submitted_at, reviewed_at
         FROM task_submissions WHERE task_id IN (?) ORDER BY task_id, id DESC`,
        [taskIds]
      )
      : [[]];
    const submissionsByTask = new Map();
    for (const submission of submissionRows) {
      const history = submissionsByTask.get(submission.task_id) || [];
      history.push(submission);
      submissionsByTask.set(submission.task_id, history);
    }

    const totalCredits = rows.filter((task) => task.status === 'approved').reduce(
      (sum, t) => sum + Number(t.credits_earned || 0),
      0
    );

    res.json({
      success: true,
      tasks: rows.map((task) => ({
        ...task,
        status: task.status === 'completed' ? 'submitted' : task.status,
        submissions: submissionsByTask.get(task.id) || []
      })),
      totalCredits
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/credits/my', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, task_id, amount, description, created_at
       FROM credit_transactions WHERE employee_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.employee_id]
    );
    const [[balance]] = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) AS balance FROM credit_transactions WHERE employee_id = ?',
      [req.user.employee_id]
    );
    res.json({ success: true, balance: Number(balance.balance), transactions: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load credit history' });
  }
});

app.get('/api/notifications/my', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, message, entity, entity_id, is_read, created_at
       FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 30`,
      [req.user.employee_id]
    );
    res.json({ success: true, notifications: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load notifications' });
  }
});

app.patch('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND recipient_id = ?',
      [req.params.id, req.user.employee_id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found' });
    res.json({ success: true, notification_id: Number(req.params.id), is_read: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

async function startTask(req, res) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const employeeId = req.user.employee_id;
    const taskId = req.params.id;
    const [rows] = await connection.query('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task not found' });
    }

    const task = rows[0];
    if (task.employee_id !== employeeId) {
      await connection.rollback();
      return res.status(403).json({ message: 'You can only start your own tasks' });
    }
    const nextStatus = allowedTransitions[task.status];
    if (nextStatus !== 'in_progress') {
      await connection.rollback();
      return res.status(400).json({ message: `Task cannot be started from '${task.status}'` });
    }

    await connection.query("UPDATE tasks SET status = 'in_progress', completed_at = NULL WHERE id = ?", [taskId]);
    await createNotification(connection, task.assigned_by, 'Task started', `${task.title} has been started by ${employeeId}.`, 'task', task.id);
    await writeAudit(connection, employeeId, 'TASK_STARTED', 'task', task.id);
    await connection.commit();
    return res.json({ success: true, task: { id: Number(taskId), status: 'in_progress' } });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Unable to start task' });
  } finally {
    connection.release();
  }
}

app.put('/api/tasks/:id/start', verifyToken, requireRole('employee'), startTask);
app.patch('/tasks/:id/status', verifyToken, requireRole('employee'), startTask);

async function submitTask(req, res) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const employeeId = req.user.employee_id;
    const taskId = req.params.id;
    const { submission_description, submission_link, work_title, work_description, work, work_date, work_time, work_duration } = req.body;
    const description = String(submission_description ?? work_description ?? work ?? '').trim();
    const link = String(submission_link || '').trim() || null;
    if (!description) {
      await connection.rollback();
      return res.status(400).json({ message: 'Submission description is required' });
    }
    if (link && (!/^https?:\/\//i.test(link) || link.length > 2048)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Submission link must be a valid HTTP or HTTPS URL' });
    }

    const [rows] = await connection.query('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task not found' });
    }

    const task = rows[0];
    if (task.employee_id !== employeeId) {
      await connection.rollback();
      return res.status(403).json({ message: 'You can only submit your own tasks' });
    }
    if (task.status !== 'in_progress') {
      await connection.rollback();
      return res.status(400).json({ message: `Task can only be submitted from 'in_progress', currently '${task.status}'` });
    }

    const [result] = await connection.query(
      `INSERT INTO task_submissions
        (task_id, employee_id, submission_description, submission_link, work_title,
         work_description, work_details, work_date, work_time, work_duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, employeeId, description, link, work_title || task.title,
        work_description || description, work || description, work_date || null,
        work_time || null, work_duration || null]
    );
    await connection.query(
      `UPDATE tasks SET submitted_work_title = ?, submitted_work_description = ?, submitted_work = ?,
       submission_link = ?, work_date = ?, work_time = ?, work_duration = ?, work_submitted_at = NOW(),
       status = 'submitted', completed_at = NOW(), review_notes = NULL WHERE id = ?`,
      [work_title || task.title, description, work || description, link,
        work_date || null, work_time || null, work_duration || null, taskId]
    );
    await createNotification(connection, task.assigned_by, 'Task submitted', `${task.title} was submitted by ${employeeId}.`, 'task', task.id);
    await writeAudit(connection, employeeId, 'TASK_SUBMITTED', 'task', task.id, { submission_id: result.insertId });
    await connection.commit();
    return res.status(201).json({ success: true, task: { id: Number(taskId), status: 'submitted' }, submission_id: result.insertId });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Unable to submit task' });
  } finally {
    connection.release();
  }
}

app.post('/api/tasks/:id/submit', verifyToken, requireRole('employee'), submitTask);
app.post('/tasks/:id/submit-work', verifyToken, requireRole('employee'), submitTask);

// ========================= STANDALONE EMPLOYEE WORK =========================
app.post('/employee-work', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const { title, description, work_date, hours_spent } = req.body;
    if (!title || !description || !work_date) {
      return res.status(400).json({ message: 'Title, description and work date are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO employee_work (employee_id, title, description, work_date, hours_spent)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.employee_id, title.trim(), description.trim(), work_date, hours_spent || null]
    );

    res.status(201).json({ message: 'Work submitted successfully', workId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to submit work' });
  }
});

app.get('/employee-work/my', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ew.*, COALESCE(u.name, ew.employee_id) AS employee_name
       FROM employee_work ew LEFT JOIN users u ON u.employee_id = ew.employee_id
       WHERE ew.employee_id = ? ORDER BY ew.created_at DESC`,
      [req.user.employee_id]
    );
    res.json({ work: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch submitted work' });
  }
});

app.get('/employee-work/:id/download', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ew.*, COALESCE(u.name, ew.employee_id) AS employee_name
       FROM employee_work ew LEFT JOIN users u ON u.employee_id = ew.employee_id
       WHERE ew.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Employee work not found' });
    if (rows[0].employee_id !== req.user.employee_id) {
      return res.status(403).json({ message: 'You can only download your own work' });
    }
    sendXlsx(res, employeeWorkToRows(rows[0]), `employee_work_${rows[0].id}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to download work' });
  }
});

// ========================= APPEALS =========================
app.get('/api/reviews/self', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM self_evaluations WHERE employee_id = ? AND period = ?`,
      [req.user.employee_id, currentPerformancePeriod()]
    );
    res.json({ success: true, evaluation: rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load self evaluation' });
  }
});

app.post('/api/reviews/self', verifyToken, requireRole('employee'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const fields = ['major_achievements', 'strengths', 'challenges', 'goals', 'kpi_progress', 'additional_comments'];
    const evaluation = Object.fromEntries(fields.map((field) => [field, String(req.body[field] || '').trim()]));
    const status = req.body.action === 'submit' ? 'submitted' : 'draft';
    if (status === 'submitted' && fields.slice(0, 5).some((field) => !evaluation[field])) {
      return res.status(400).json({ message: 'Complete achievements, strengths, challenges, goals, and KPI progress before submission' });
    }

    await connection.beginTransaction();
    const employeeId = req.user.employee_id;
    const period = currentPerformancePeriod();
    const [existingRows] = await connection.query(
      'SELECT * FROM self_evaluations WHERE employee_id = ? AND period = ? FOR UPDATE',
      [employeeId, period]
    );
    if (existingRows[0]?.status === 'submitted') {
      await connection.rollback();
      return res.status(409).json({ message: 'Submitted evaluations are final and cannot be changed' });
    }

    let evaluationId;
    if (existingRows.length) {
      evaluationId = existingRows[0].id;
      await connection.query(
        `UPDATE self_evaluations SET major_achievements = ?, strengths = ?, challenges = ?,
         goals = ?, kpi_progress = ?, additional_comments = ?, status = ?,
         submitted_at = IF(? = 'submitted', NOW(), NULL) WHERE id = ?`,
        [...fields.map((field) => evaluation[field]), status, status, evaluationId]
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO self_evaluations
          (employee_id, period, major_achievements, strengths, challenges, goals,
           kpi_progress, additional_comments, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'submitted', NOW(), NULL))`,
        [employeeId, period, ...fields.map((field) => evaluation[field]), status, status]
      );
      evaluationId = result.insertId;
      await writeAudit(connection, employeeId, 'SELF_EVALUATION_CREATED', 'self_evaluation', evaluationId, { period, status });
    }

    if (status === 'submitted') {
      const managerIds = await getEmployeeManagers(employeeId, connection);
      for (const managerId of managerIds) {
        await createNotification(connection, managerId, 'Self evaluation submitted', `Employee ${employeeId} submitted the ${period} self evaluation.`, 'self_evaluation', evaluationId);
      }
      await writeAudit(connection, employeeId, 'SELF_EVALUATION_SUBMITTED', 'self_evaluation', evaluationId, { period });
    }

    await connection.commit();
    return res.status(existingRows.length ? 200 : 201).json({
      success: true,
      evaluation: { id: evaluationId, employee_id: employeeId, period, ...evaluation, status }
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Failed to save self evaluation' });
  } finally {
    connection.release();
  }
});

app.get('/api/reviews/manager/team', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const period = currentPerformancePeriod();
    const [rows] = await pool.query(
      `SELECT users.employee_id, users.name, directory.department,
        directory.performance_score AS source_kpi_score,
        (SELECT monthly.performance_score FROM monthly_performance monthly
         WHERE monthly.employee_id = users.employee_id ORDER BY monthly.month DESC LIMIT 1) AS current_performance,
        (SELECT evaluation.status FROM self_evaluations evaluation
         WHERE evaluation.employee_id = users.employee_id AND evaluation.period = ?) AS self_evaluation_status,
        EXISTS(SELECT 1 FROM manager_reviews review
          WHERE review.employee_id = users.employee_id AND review.period = ?) AS review_exists,
        (SELECT COUNT(*) FROM tasks WHERE employee_id = users.employee_id) AS task_count,
        (SELECT SUM(status = 'approved') FROM tasks WHERE employee_id = users.employee_id) AS approved_tasks
       FROM users
       INNER JOIN employee_directory directory ON directory.employee_id = users.employee_id
       INNER JOIN employee_directory manager ON manager.employee_id = ? AND manager.department = directory.department
       WHERE users.role = 'employee' AND directory.resigned = FALSE
       ORDER BY users.name`,
      [period, period, req.user.employee_id]
    );
    res.json({
      success: true,
      period,
      employees: rows.map((employee) => ({
        ...employee,
        task_score: Number(employee.task_count) ? Number(employee.approved_tasks || 0) * 100 / Number(employee.task_count) : 0,
        kpi_score: normalizeKpiScore(employee.source_kpi_score),
        self_evaluation_status: employee.self_evaluation_status || 'not_started',
        review_status: Number(employee.review_exists) ? 'submitted' : 'pending'
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load manager review team' });
  }
});

app.get('/api/reviews/manager/:employeeId', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    const teamMember = await getManagerEmployee(req.user.employee_id, employeeId);
    if (!teamMember) return res.status(403).json({ message: 'Employee is not in your permitted department team' });
    const period = currentPerformancePeriod();
    const [employeeRows] = await pool.query(
      `SELECT users.employee_id, users.name, directory.department, directory.job_title,
              directory.performance_score AS source_kpi_score
       FROM users INNER JOIN employee_directory directory ON directory.employee_id = users.employee_id
       WHERE users.employee_id = ?`,
      [employeeId]
    );
    const [evaluationRows] = await pool.query(
      'SELECT * FROM self_evaluations WHERE employee_id = ? ORDER BY period DESC LIMIT 1',
      [employeeId]
    );
    const [history] = await pool.query(
      'SELECT month, tasks_completed, manager_rating, performance_score, performance_class FROM monthly_performance WHERE employee_id = ? ORDER BY month DESC',
      [employeeId]
    );
    const [taskRows] = await pool.query(
      'SELECT id, title, status, due_date, priority, credits_earned FROM tasks WHERE employee_id = ? ORDER BY created_at DESC',
      [employeeId]
    );
    const [reviewRows] = await pool.query(
      'SELECT * FROM manager_reviews WHERE employee_id = ? ORDER BY period DESC',
      [employeeId]
    );
    res.json({
      success: true,
      period,
      employee: { ...employeeRows[0], kpi_score: normalizeKpiScore(employeeRows[0].source_kpi_score) },
      self_evaluation: evaluationRows[0] || null,
      task_score: taskRows.length ? taskRows.filter((task) => task.status === 'approved').length * 100 / taskRows.length : 0,
      tasks: taskRows,
      performance_history: history,
      previous_reviews: reviewRows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load employee review details' });
  }
});

app.post('/api/reviews/manager', verifyToken, requireRole('manager'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const employeeId = String(req.body.employee_id || '').trim();
    const managerRating = Number(req.body.manager_rating);
    if (!employeeId || !Number.isFinite(managerRating) || managerRating < 0 || managerRating > 100) {
      return res.status(400).json({ message: 'Employee and a manager rating from 0 to 100 are required' });
    }
    const textFields = ['strengths', 'improvement_areas', 'recommendations', 'comments'];
    const review = Object.fromEntries(textFields.map((field) => [field, String(req.body[field] || '').trim()]));

    await connection.beginTransaction();
    const authorizedEmployee = await getManagerEmployee(req.user.employee_id, employeeId, connection);
    if (!authorizedEmployee) {
      await connection.rollback();
      return res.status(403).json({ message: 'Employee is not in your permitted department team' });
    }
    const period = currentPerformancePeriod();
    const [evaluationRows] = await connection.query(
      'SELECT id,status FROM self_evaluations WHERE employee_id = ? AND period = ? FOR UPDATE',
      [employeeId, period]
    );
    if (evaluationRows[0]?.status !== 'submitted') {
      await connection.rollback();
      return res.status(409).json({ message: 'Employee must submit this period self evaluation before manager review' });
    }

    const [existingRows] = await connection.query(
      'SELECT id FROM manager_reviews WHERE employee_id = ? AND period = ? FOR UPDATE',
      [employeeId, period]
    );
    let reviewId;
    if (existingRows.length) {
      reviewId = existingRows[0].id;
      await connection.query(
        `UPDATE manager_reviews SET manager_id = ?, manager_rating = ?, strengths = ?,
         improvement_areas = ?, recommendations = ?, comments = ? WHERE id = ?`,
        [req.user.employee_id, managerRating, ...textFields.map((field) => review[field]), reviewId]
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO manager_reviews
          (employee_id, manager_id, period, manager_rating, strengths, improvement_areas, recommendations, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [employeeId, req.user.employee_id, period, managerRating, ...textFields.map((field) => review[field])]
      );
      reviewId = result.insertId;
    }

    const performance = await recalculatePerformance(connection, employeeId, period, managerRating);
    await createNotification(connection, employeeId, 'Manager performance review completed', `Your manager review for ${period} is available.`, 'manager_review', reviewId);
    await writeAudit(connection, req.user.employee_id, 'MANAGER_REVIEW_CREATED', 'manager_review', reviewId, { employee_id: employeeId, period, manager_rating: managerRating });
    await writeAudit(connection, req.user.employee_id, 'PERFORMANCE_RECALCULATED', 'monthly_performance', performance.id, {
      employee_id: employeeId, period, score: performance.score, weights: performance.weights
    });
    await connection.commit();
    return res.json({ success: true, review_id: reviewId, period, performance });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Failed to save manager review' });
  } finally {
    connection.release();
  }
});

app.get('/api/reviews/performance/my', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const [employeeRows] = await pool.query(
      'SELECT performance_score FROM employee_directory WHERE employee_id = ?',
      [employeeId]
    );
    const [history] = await pool.query(
      'SELECT id, month, tasks_completed, manager_rating, performance_score, performance_class FROM monthly_performance WHERE employee_id = ? ORDER BY month',
      [employeeId]
    );
    const current = history[history.length - 1] || null;
    const [reviewRows] = current
      ? await pool.query('SELECT * FROM manager_reviews WHERE employee_id = ? AND period = ?', [employeeId, current.month])
      : [[]];
    const [[taskCounts]] = await pool.query(
      `SELECT COUNT(*) AS task_count, SUM(status = 'approved') AS approved_count
       FROM tasks WHERE employee_id = ?`,
      [employeeId]
    );
    const taskScore = Number(taskCounts.task_count)
      ? Number(taskCounts.approved_count || 0) * 100 / Number(taskCounts.task_count)
      : 0;
    const kpiScore = normalizeKpiScore(employeeRows[0]?.performance_score);
    const managerRating = Number(current?.manager_rating || 0);
    const weights = await getPerformanceWeights(pool);
    res.json({
      success: true,
      performance: current ? {
        ...current,
        performance_class: getPerformanceClassification(Number(current.performance_score)),
        task_score: Number(taskScore.toFixed(2)), kpi_score: kpiScore, manager_rating: managerRating,
        appeal_id: current.id
      } : null,
      feedback: reviewRows[0] || null,
      history,
      weights
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load performance summary' });
  }
});

app.get('/my-appeals', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM appeals WHERE employee_id = ? ORDER BY created_at DESC', [req.user.employee_id]);
    res.json({ appeals: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

async function createEmployeeAppeal(req, res) {
  const connection = await pool.getConnection();
  try {
    const employeeId = req.user.employee_id;
    const { task_id, monthly_performance_id, reason, evidence } = req.body;
    const normalizedReason = String(reason || '').trim();
    const normalizedEvidence = String(evidence || '').trim() || null;
    if (!normalizedReason) return res.status(400).json({ message: 'Reason is required' });
    if (!task_id && !monthly_performance_id) return res.status(400).json({ message: 'Must provide either task_id or monthly_performance_id' });
    if (task_id && monthly_performance_id) return res.status(400).json({ message: 'Provide only one: task_id OR monthly_performance_id, not both' });

    await connection.beginTransaction();
    let appealType = 'monthly_rating';
    if (task_id) {
      const [taskRows] = await connection.query('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [task_id]);
      if (!taskRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: 'Task not found' });
      }
      const task = taskRows[0];
      if (task.employee_id !== employeeId) {
        await connection.rollback();
        return res.status(403).json({ message: 'You can only appeal your own tasks' });
      }

      if (task.status === 'rejected') appealType = 'task_rejection';
      else if (task.status === 'approved' && task.credit_rating !== null && task.credit_rating <= 3) appealType = 'task_low_credit';
      else if (task.status === 'approved') {
        await connection.rollback();
        return res.status(400).json({ message: `This task's credit rating (${task.credit_rating ?? 'none'}/5) is already 4 or above and cannot be appealed` });
      } else {
        await connection.rollback();
        return res.status(400).json({ message: `Only rejected tasks, or approved tasks with a credit rating of 3 or below, can be appealed. This task is currently '${task.status}'` });
      }

      const [existingRows] = await connection.query("SELECT id FROM appeals WHERE task_id = ? AND status = 'pending' FOR UPDATE", [task_id]);
      if (existingRows.length) {
        await connection.rollback();
        return res.status(409).json({ message: 'There is already a pending appeal for this task' });
      }
    } else {
      const [performanceRows] = await connection.query(
        'SELECT id FROM monthly_performance WHERE id = ? AND employee_id = ? FOR UPDATE',
        [monthly_performance_id, employeeId]
      );
      if (!performanceRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: 'Performance review not found' });
      }
      const [existingRows] = await connection.query(
        "SELECT id FROM appeals WHERE monthly_performance_id = ? AND status = 'pending' FOR UPDATE",
        [monthly_performance_id]
      );
      if (existingRows.length) {
        await connection.rollback();
        return res.status(409).json({ message: 'There is already a pending appeal for this performance review' });
      }
    }

    const [result] = await connection.query(
      `INSERT INTO appeals
        (employee_id, task_id, monthly_performance_id, reason, evidence, status, appeal_type, current_level)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, 'manager')`,
      [employeeId, task_id || null, monthly_performance_id || null, normalizedReason, normalizedEvidence, appealType]
    );
    const managerIds = await getEmployeeManagers(employeeId, connection);
    for (const managerId of managerIds) {
      await createNotification(connection, managerId, 'Employee appeal submitted', `Employee ${employeeId} submitted an appeal for manager review.`, 'appeal', result.insertId);
    }
    await writeAudit(connection, employeeId, 'APPEAL_CREATED', 'appeal', result.insertId, { appeal_type: appealType });
    await connection.commit();
    return res.status(201).json({ success: true, message: 'Appeal submitted', appealId: result.insertId, appeal_type: appealType, current_level: 'manager' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Failed to submit appeal' });
  } finally {
    connection.release();
  }
}

app.post('/api/appeals', verifyToken, requireRole('employee'), createEmployeeAppeal);
app.post('/appeals', verifyToken, requireRole('employee'), createEmployeeAppeal);

// ========================= MANAGER =========================
app.get('/manager/employees', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT employee.employee_id, employee.department, employee.job_title
       FROM employee_directory employee
       INNER JOIN users employee_user ON employee_user.employee_id = employee.employee_id
         AND employee_user.role = 'employee'
       INNER JOIN employee_directory manager ON manager.employee_id = ?
         AND manager.department = employee.department
       WHERE employee.resigned = FALSE ORDER BY employee.employee_id ASC`,
      [req.user.employee_id]
    );
    res.json({ employees: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/tasks', verifyToken, requireRole('manager'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { employee_id, title, description, due_date, priority = 'medium' } = req.body;
    const normalizedTitle = String(title || '').trim();
    const normalizedDescription = String(description || '').trim();
    const allowedPriorities = ['low', 'medium', 'high', 'critical'];
    if (!employee_id || !normalizedTitle || !normalizedDescription || !due_date) {
      return res.status(400).json({ message: 'Employee, title, description and due date are required' });
    }
    if (!allowedPriorities.includes(priority)) return res.status(400).json({ message: 'Priority must be low, medium, high, or critical' });
    if (Number.isNaN(Date.parse(due_date))) return res.status(400).json({ message: 'Deadline must be a valid date' });

    await connection.beginTransaction();
    const employee = await getManagerEmployee(req.user.employee_id, employee_id, connection);
    if (!employee) {
      await connection.rollback();
      return res.status(403).json({ message: 'Employee is not in your permitted department team' });
    }

    const [result] = await connection.query(
      `INSERT INTO tasks (employee_id, assigned_by, title, description, due_date, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned')`,
      [employee_id, req.user.employee_id, normalizedTitle, normalizedDescription, due_date, priority]
    );
    await createNotification(connection, employee_id, 'Task assigned', `${normalizedTitle} was assigned to you.`, 'task', result.insertId);
    await writeAudit(connection, req.user.employee_id, 'TASK_CREATED', 'task', result.insertId, { employee_id, priority });
    await connection.commit();
    return res.status(201).json({
      success: true,
      task: {
        id: result.insertId, employee_id, assigned_by: req.user.employee_id,
        title: normalizedTitle, description: normalizedDescription, due_date,
        priority, status: 'assigned'
      }
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Failed to assign task' });
  } finally {
    connection.release();
  }
});

app.get('/team-tasks/pending-review', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tasks.*, COALESCE(users.name, tasks.employee_id) AS employee_name,
              submissions.id AS submission_id,
              submissions.submission_description, submissions.submission_link,
              submissions.submitted_at
       FROM tasks
       LEFT JOIN users ON users.employee_id = tasks.employee_id
       LEFT JOIN task_submissions submissions ON submissions.id = (
         SELECT MAX(latest.id) FROM task_submissions latest WHERE latest.task_id = tasks.id
       )
       WHERE tasks.assigned_by = ? AND tasks.status = 'submitted'
       ORDER BY submissions.submitted_at ASC`,
      [req.user.employee_id]
    );
    res.json({ tasks: rows.map(task => ({ ...task, is_late: task.due_date ? new Date(task.completed_at) > new Date(task.due_date) : null })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

async function reviewTask(req, res) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const taskId = req.params.id;
    const { decision, comment, review_notes, credit_rating } = req.body;
    const rejectionComment = String(comment ?? review_notes ?? '').trim();
    if (!['approved', 'rejected'].includes(decision)) {
      await connection.rollback();
      return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    }
    if (decision === 'rejected' && !rejectionComment) {
      await connection.rollback();
      return res.status(400).json({ message: 'A rejection comment is required' });
    }

    let creditRatingValue = null;
    if (decision === 'approved') {
      creditRatingValue = Number(credit_rating);
      if (!Number.isInteger(creditRatingValue) || creditRatingValue < 1 || creditRatingValue > 5) {
        await connection.rollback();
        return res.status(400).json({ message: 'credit_rating is required when approving and must be an integer from 1 to 5' });
      }
    }

    const [rows] = await connection.query('SELECT * FROM tasks WHERE id = ? FOR UPDATE', [taskId]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Task not found' });
    }
    const task = rows[0];
    if (task.assigned_by !== req.user.employee_id) {
      await connection.rollback();
      return res.status(403).json({ message: 'You can only review tasks assigned by you' });
    }
    if (task.status !== 'submitted') {
      await connection.rollback();
      return res.status(400).json({ message: `Task must be 'submitted' to review, currently '${task.status}'` });
    }

    let credits = null;
    if (decision === 'approved') {
      const [perfRows] = await connection.query('SELECT performance_score FROM monthly_performance WHERE employee_id = ? ORDER BY month DESC LIMIT 1 FOR UPDATE', [task.employee_id]);
      const latestScore = perfRows.length ? Number(perfRows[0].performance_score) : 50;
      credits = (latestScore / 10).toFixed(2);
    }

    const qualityRating = decision === 'approved' ? 'satisfactory' : 'unsatisfactory';
    await connection.query(
      'UPDATE tasks SET status = ?, quality_rating = ?, credit_rating = ?, review_notes = ?, credits_earned = ? WHERE id = ?',
      [decision, qualityRating, creditRatingValue, decision === 'rejected' ? rejectionComment : (review_notes || null), credits, taskId]
    );
    const [submissionRows] = await connection.query(
      'SELECT id FROM task_submissions WHERE task_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
      [taskId]
    );
    if (submissionRows.length) {
      await connection.query(
        'UPDATE task_submissions SET status = ?, review_comment = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
        [decision, decision === 'rejected' ? rejectionComment : (review_notes || null), req.user.employee_id, submissionRows[0].id]
      );
    }

    let performance = null;
    if (decision === 'approved') {
      await connection.query(
        `INSERT INTO credit_transactions (employee_id, task_id, amount, transaction_type, description, actor_id)
         VALUES (?, ?, ?, 'task_approved', ?, ?)`,
        [task.employee_id, task.id, credits, `Credits for approved task: ${task.title}`, req.user.employee_id]
      );
      await writeAudit(connection, req.user.employee_id, 'CREDITS_AWARDED', 'task', task.id, { amount: Number(credits) });
      performance = await recalculatePerformance(
        connection, task.employee_id, currentPerformancePeriod(), creditRatingValue * 20
      );
    }

    await createNotification(
      connection, task.employee_id, decision === 'approved' ? 'Task approved' : 'Task rejected',
      decision === 'approved' ? `${task.title} was approved.` : `${task.title} was rejected: ${rejectionComment}`,
      'task', task.id
    );
    await writeAudit(connection, req.user.employee_id, decision === 'approved' ? 'TASK_APPROVED' : 'TASK_REJECTED', 'task', task.id,
      decision === 'rejected' ? { comment: rejectionComment } : { credit_rating: creditRatingValue });
    await connection.commit();
    return res.json({
      success: true, task: { id: Number(taskId), status: decision },
      credits_earned: credits === null ? null : Number(credits),
      performance_score: performance?.score ?? null
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ message: 'Failed to review task' });
  } finally {
    connection.release();
  }
}

app.post('/api/tasks/:id/review', verifyToken, requireRole('manager'), reviewTask);
app.patch('/tasks/:id/review', verifyToken, requireRole('manager'), reviewTask);

// Manager sees every standalone employee-work submission with full content.
app.get('/manager/employee-work', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ew.*, COALESCE(u.name, ew.employee_id) AS employee_name
       FROM employee_work ew LEFT JOIN users u ON u.employee_id = ew.employee_id
       ORDER BY CASE WHEN ew.status = 'pending' THEN 0 ELSE 1 END, ew.created_at DESC`
    );
    res.json({ work: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch employee-submitted work' });
  }
});

app.patch('/manager/employee-work/:id/review', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const workId = req.params.id;
    const { decision, review_notes } = req.body;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });

    const [rows] = await pool.query('SELECT * FROM employee_work WHERE id = ?', [workId]);
    if (!rows.length) return res.status(404).json({ message: 'Employee work not found' });
    const work = rows[0];
    if (work.status !== 'pending') return res.status(400).json({ message: `Work has already been ${work.status}` });

    let creditsEarned = 0;
    if (decision === 'approved') {
      const [perfRows] = await pool.query('SELECT performance_score FROM monthly_performance WHERE employee_id = ? ORDER BY month DESC LIMIT 1', [work.employee_id]);
      const performanceScore = perfRows.length ? Number(perfRows[0].performance_score) : 50;
      creditsEarned = Number(Math.min(performanceScore / 20, 5).toFixed(2));
    }

    await pool.query(
      `UPDATE employee_work SET status = ?, review_notes = ?, credits_earned = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [decision, review_notes || null, creditsEarned, req.user.employee_id, workId]
    );

    res.json({ message: `Employee work ${decision} successfully`, workId: Number(workId), status: decision, creditsEarned, reviewedBy: req.user.employee_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to review employee work' });
  }
});

app.get('/manager/employee-work/:id/download', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ew.*, COALESCE(u.name, ew.employee_id) AS employee_name FROM employee_work ew LEFT JOIN users u ON u.employee_id = ew.employee_id WHERE ew.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Employee work not found' });
    sendXlsx(res, employeeWorkToRows(rows[0]), `employee_work_${rows[0].id}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to download work' });
  }
});

app.get('/manager/stats', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT COUNT(*) AS total_tasks, SUM(status='assigned') AS assigned_tasks, SUM(status='in_progress') AS in_progress_tasks, SUM(status='submitted') AS submitted_tasks, SUM(status='approved') AS approved_tasks, SUM(status='rejected') AS rejected_tasks FROM tasks WHERE assigned_by = ?`, [req.user.employee_id]);
    const [employeeRows] = await pool.query(`SELECT COUNT(*) AS total_members FROM employee_directory employee INNER JOIN users ON users.employee_id = employee.employee_id AND users.role = 'employee' INNER JOIN employee_directory manager ON manager.employee_id = ? AND manager.department = employee.department WHERE employee.resigned = FALSE`, [req.user.employee_id]);
    res.json({
      total_tasks: Number(rows[0].total_tasks || 0), assigned_tasks: Number(rows[0].assigned_tasks || 0),
      in_progress_tasks: Number(rows[0].in_progress_tasks || 0), submitted_tasks: Number(rows[0].submitted_tasks || 0),
      approved_tasks: Number(rows[0].approved_tasks || 0), rejected_tasks: Number(rows[0].rejected_tasks || 0),
      total_members: Number(employeeRows[0].total_members || 0)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Task submission download for employee/manager/senior authority.
app.get('/tasks/:id/work/download', verifyToken, requireRole('manager', 'sm', 'employee'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tasks.*, COALESCE(users.name, tasks.employee_id) AS employee_name FROM tasks LEFT JOIN users ON users.employee_id = tasks.employee_id WHERE tasks.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Task not found' });
    const task = rows[0];

    if (req.user.role === 'employee' && task.employee_id !== req.user.employee_id) return res.status(403).json({ message: 'You can only download your own submitted work' });
    if (req.user.role === 'manager' && task.assigned_by !== req.user.employee_id) return res.status(403).json({ message: 'You can only download work assigned by you' });
    if (!task.work_submitted_at && !task.submitted_work && !task.submitted_work_title) return res.status(404).json({ message: 'Employee has not submitted work for this task yet' });

    sendXlsx(res, taskToRows(task), `work_${task.id}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to download work' });
  }
});

app.get('/tasks/:id/work', verifyToken, requireRole('manager', 'sm', 'employee'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT tasks.*, COALESCE(users.name, tasks.employee_id) AS employee_name FROM tasks LEFT JOIN users ON users.employee_id = tasks.employee_id WHERE tasks.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Task not found' });
    const task = rows[0];
    if (req.user.role === 'employee' && task.employee_id !== req.user.employee_id) return res.status(403).json({ message: 'You can only view your own work' });
    if (req.user.role === 'manager' && task.assigned_by !== req.user.employee_id) return res.status(403).json({ message: 'You can only view work assigned by you' });
    if (!task.work_submitted_at && !task.submitted_work && !task.submitted_work_title) return res.status(404).json({ message: 'Employee has not submitted work for this task yet' });
    res.json({ work: task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ========================= SENIOR AUTHORITY =========================
app.get('/appeals/pending', verifyToken, requireRole('sm'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT appeals.*, tasks.title AS task_title, tasks.description AS task_description, tasks.status AS task_status,
      tasks.review_notes AS manager_review_notes, tasks.quality_rating, tasks.credit_rating AS current_credit_rating,
      tasks.credits_earned, tasks.submitted_work_title, tasks.submitted_work_description, tasks.submitted_work,
      tasks.work_date, tasks.work_time, tasks.work_duration, tasks.work_submitted_at,
      COALESCE(users.name, appeals.employee_id) AS employee_name
      FROM appeals LEFT JOIN tasks ON appeals.task_id = tasks.id LEFT JOIN users ON users.employee_id = appeals.employee_id
      WHERE appeals.status = 'pending' AND appeals.current_level = 'senior_authority'
      ORDER BY appeals.created_at ASC`
    );
    res.json({ appeals: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.patch('/appeals/:id/resolve', verifyToken, requireRole('sm'), async (req, res) => {
  try {
    const appealId = req.params.id;
    const { decision, resolution_notes, new_credit_rating } = req.body;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });

    const [appealRows] = await pool.query('SELECT * FROM appeals WHERE id = ?', [appealId]);
    if (!appealRows.length) return res.status(404).json({ message: 'Appeal not found' });
    const appeal = appealRows[0];
    if (appeal.status !== 'pending') return res.status(400).json({ message: `Appeal already resolved as '${appeal.status}'` });
    if (appeal.current_level !== 'senior_authority') return res.status(403).json({ message: 'Appeal has not reached the senior authority level' });

    let credits = null;
    let updatedCreditRating = null;

    if (decision === 'approved' && appeal.appeal_type === 'task_low_credit' && appeal.task_id) {
      const rating = Number(new_credit_rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'new_credit_rating is required and must be an integer from 1 to 5' });
      const [taskRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [appeal.task_id]);
      const task = taskRows[0];
      if (rating <= task.credit_rating) return res.status(400).json({ message: `new_credit_rating (${rating}) must be higher than the current rating (${task.credit_rating})` });
      await pool.query("UPDATE tasks SET credit_rating = ?, review_notes = CONCAT(COALESCE(review_notes, ''), ' | Credit rating raised on appeal') WHERE id = ?", [rating, appeal.task_id]);
      updatedCreditRating = rating;
    } else if (decision === 'approved' && appeal.appeal_type === 'task_rejection' && appeal.task_id) {
      const [taskRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [appeal.task_id]);
      const task = taskRows[0];
      const [perfRows] = await pool.query('SELECT performance_score FROM monthly_performance WHERE employee_id = ? ORDER BY month DESC LIMIT 1', [task.employee_id]);
      const latestScore = perfRows.length ? Number(perfRows[0].performance_score) : 50;
      credits = (latestScore / 10).toFixed(2);
      const rating = Number(new_credit_rating);
      updatedCreditRating = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 3;
      await pool.query("UPDATE tasks SET status='approved', credits_earned=?, credit_rating=?, review_notes=CONCAT(COALESCE(review_notes, ''), ' | Overturned on appeal') WHERE id=?", [credits, updatedCreditRating, appeal.task_id]);
    }

    await pool.query('UPDATE appeals SET status = ?, resolution_notes = ?, resolved_at = NOW() WHERE id = ?', [decision, resolution_notes || null, appealId]);
    res.json({ message: `Appeal ${decision}`, credits_earned: credits, credit_rating: updatedCreditRating });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/appeals/stats', verifyToken, requireRole('sm'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT COUNT(*) AS total, SUM(status='pending') AS pending, SUM(status='approved') AS approved, SUM(status='rejected') AS rejected FROM appeals`);
    const stats = rows[0];
    res.json({ total: Number(stats.total || 0), pending: Number(stats.pending || 0), approved: Number(stats.approved || 0), rejected: Number(stats.rejected || 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/dashboard/analytics', verifyToken, async (req, res) => {
  try {
    const [monthlyRows] = await pool.query(`
      SELECT DATE_FORMAT(month, '%Y-%m') AS month,
             ROUND(AVG(performance_score), 2) AS avg_score
      FROM monthly_performance
      GROUP BY DATE_FORMAT(month, '%Y-%m')
      ORDER BY month DESC
      LIMIT 6
    `);

    const [departmentRows] = await pool.query(`
      SELECT ed.department AS name,
             ROUND(AVG(mp.performance_score), 2) AS score
      FROM monthly_performance mp
      INNER JOIN employee_directory ed ON ed.employee_id = mp.employee_id
      WHERE ed.department IS NOT NULL AND ed.department <> ''
      GROUP BY ed.department
      ORDER BY score DESC
      LIMIT 6
    `);

    const [performanceRows] = await pool.query('SELECT performance_score FROM monthly_performance');
    const classifications = new Map();
    for (const row of performanceRows) {
      const name = getPerformanceClassification(Number(row.performance_score));
      classifications.set(name, (classifications.get(name) || 0) + 1);
    }
    const distributionRows = [...classifications].map(([name, value]) => ({ name, value }));

    const [employeeRows] = await pool.query(`
      SELECT employee_id AS employeeId,
             ROUND(AVG(performance_score), 2) AS score,
             MAX(month) AS latestMonth
      FROM monthly_performance
      GROUP BY employee_id
      ORDER BY score DESC
      LIMIT 8
    `);

    res.json({
      success: true,
      message: 'Analytics loaded successfully',
      data: {
        monthlyTrend: [...monthlyRows].reverse(),
        departmentComparison: departmentRows,
        distribution: distributionRows,
        employeePerformance: employeeRows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Unable to load analytics' });
  }
});

app.get('/performance-officer/dashboard', verifyToken, requireRole('performance_officer'), async (req, res) => {
  try {
    const [statsRows] = await pool.query(`
      SELECT COUNT(*) AS total_cases,
             SUM(status = 'pending') AS pending_cases,
             SUM(status = 'approved') AS approved_cases,
             SUM(status = 'rejected') AS rejected_cases
      FROM appeals
    `);

    const [casesRows] = await pool.query(`
      SELECT a.*, u.name AS employee_name, t.title AS task_title
      FROM appeals a
      LEFT JOIN users u ON u.employee_id = a.employee_id
      LEFT JOIN tasks t ON t.id = a.task_id
      WHERE a.status = 'pending'
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    const [teamRows] = await pool.query(`
      SELECT ROUND(AVG(performance_score), 2) AS team_average,
             MIN(performance_score) AS lowest_score,
             MAX(performance_score) AS highest_score
      FROM monthly_performance
    `);

    const [alertRows] = await pool.query(`
      SELECT employee_id, performance_score, month
      FROM monthly_performance
      WHERE performance_score < 60
      ORDER BY month DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      message: 'Performance officer dashboard loaded',
      data: {
        stats: { total_cases: Number(statsRows[0].total_cases || 0), pending_cases: Number(statsRows[0].pending_cases || 0), approved_cases: Number(statsRows[0].approved_cases || 0), rejected_cases: Number(statsRows[0].rejected_cases || 0) },
        cases: casesRows,
        teamAverage: Number(teamRows[0].team_average || 0),
        alerts: alertRows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Unable to load dashboard' });
  }
});

app.get('/appeal-board/dashboard', verifyToken, requireRole('board_member'), async (req, res) => {
  try {
    const [statsRows] = await pool.query(`
      SELECT COUNT(*) AS total_cases,
             SUM(status = 'pending') AS pending_cases,
             SUM(status = 'approved') AS approved_cases,
             SUM(status = 'rejected') AS rejected_cases
      FROM appeals
    `);

    const [casesRows] = await pool.query(`
      SELECT a.*, u.name AS employee_name, t.title AS task_title
      FROM appeals a
      LEFT JOIN users u ON u.employee_id = a.employee_id
      LEFT JOIN tasks t ON t.id = a.task_id
      ORDER BY a.created_at DESC
      LIMIT 12
    `);

    const [recentRows] = await pool.query(`
      SELECT a.id, u.name AS employee_name, a.status, a.created_at
      FROM appeals a
      LEFT JOIN users u ON u.employee_id = a.employee_id
      WHERE a.status IN ('approved', 'rejected')
      ORDER BY a.resolved_at DESC, a.created_at DESC
      LIMIT 6
    `);

    res.json({
      success: true,
      message: 'Appeal board dashboard loaded',
      data: {
        stats: { total_cases: Number(statsRows[0].total_cases || 0), pending_cases: Number(statsRows[0].pending_cases || 0), approved_cases: Number(statsRows[0].approved_cases || 0), rejected_cases: Number(statsRows[0].rejected_cases || 0) },
        cases: casesRows,
        recentDecisions: recentRows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Unable to load board dashboard' });
  }
});

app.get('/admin/dashboard', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const [userRows] = await pool.query(`SELECT COUNT(*) AS total_users FROM users`);
    const [taskRows] = await pool.query(`SELECT COUNT(*) AS total_tasks, SUM(status='assigned') AS assigned_tasks, SUM(status='submitted') AS submitted_tasks, SUM(status='approved') AS approved_tasks FROM tasks`);
    const [appealRows] = await pool.query(`SELECT COUNT(*) AS total_appeals, SUM(status='pending') AS pending_appeals FROM appeals`);
    const [auditRows] = await pool.query(`SELECT employee_id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5`);

    res.json({
      success: true,
      message: 'Admin dashboard loaded',
      data: {
        stats: {
          total_users: Number(userRows[0].total_users || 0),
          total_tasks: Number(taskRows[0].total_tasks || 0),
          assigned_tasks: Number(taskRows[0].assigned_tasks || 0),
          submitted_tasks: Number(taskRows[0].submitted_tasks || 0),
          completed_tasks: Number(taskRows[0].approved_tasks || 0),
          approved_tasks: Number(taskRows[0].approved_tasks || 0),
          total_appeals: Number(appealRows[0].total_appeals || 0),
          pending_appeals: Number(appealRows[0].pending_appeals || 0)
        },
        recentUsers: auditRows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Unable to load admin dashboard' });
  }
});

// Senior Authority can see and download all standalone employee submissions.
app.get('/senior/employee-work', verifyToken, requireRole('sm'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT ew.*, COALESCE(u.name, ew.employee_id) AS employee_name FROM employee_work ew LEFT JOIN users u ON u.employee_id = ew.employee_id ORDER BY ew.created_at DESC`);
    res.json({ work: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch employee work' });
  }
});

app.get('/senior/employee-work/:id/download', verifyToken, requireRole('sm'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT ew.*, COALESCE(u.name, ew.employee_id) AS employee_name FROM employee_work ew LEFT JOIN users u ON u.employee_id = ew.employee_id WHERE ew.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Employee work not found' });
    sendXlsx(res, employeeWorkToRows(rows[0]), `employee_work_${rows[0].id}.xlsx`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to download work' });
  }
});

const PORT = process.env.PORT || 3000;

ensureTaskColumns()
  .then(() => ensureEmployeeWorkTable())
  .then(() => ensureWorkflowSchema())
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Database setup failed:', err);
    process.exit(1);
  });
