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

const app = express();
app.use(cors());
app.use(express.json());

const allowedTransitions = {
  assigned: 'in_progress',
  in_progress: 'completed'
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
    ['submitted_work_title', 'VARCHAR(255) NULL'],
    ['submitted_work_description', 'TEXT NULL'],
    ['submitted_work', 'TEXT NULL'],
    ['work_date', 'DATE NULL'],
    ['work_time', 'TIME NULL'],
    ['work_duration', 'VARCHAR(100) NULL'],
    ['work_submitted_at', 'DATETIME NULL']
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
app.post('/login', async (req, res) => {
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
    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.role !== role) {
      return res.status(403).json({
        message: `These credentials are not registered for the ${role === 'employee' ? 'Employee' : role === 'manager' ? 'Chief Manager' : 'Senior Authority'} portal.`
      });
    }

    const token = jwt.sign(
      { id: user.id, employee_id: user.employee_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { name: user.name, role: user.role, employee_id: user.employee_id, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
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
      'SELECT * FROM tasks WHERE employee_id = ? ORDER BY created_at DESC',
      [employeeId]
    );

    const grouped = {
      assigned: rows.filter(t => t.status === 'assigned'),
      in_progress: rows.filter(t => t.status === 'in_progress'),
      completed: rows.filter(t => t.status === 'completed'),
      approved: rows.filter(t => t.status === 'approved'),
      rejected: rows.filter(t => t.status === 'rejected')
    };

    const totalCredits = grouped.approved.reduce(
      (sum, t) => sum + Number(t.credits_earned || 0),
      0
    );

    res.json({ tasks: grouped, totalCredits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.patch('/tasks/:id/status', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const taskId = req.params.id;
    const { status } = req.body;

    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Task not found' });

    const task = rows[0];
    if (task.employee_id !== employeeId) {
      return res.status(403).json({ message: 'You can only update your own tasks' });
    }

    const expectedNextStatus = allowedTransitions[task.status];
    if (!expectedNextStatus) {
      return res.status(400).json({ message: `Task is already '${task.status}' and cannot be updated further by you` });
    }
    if (status !== expectedNextStatus) {
      return res.status(400).json({ message: `Invalid transition. From '${task.status}', you can only move to '${expectedNextStatus}'` });
    }

    if (status === 'completed') {
      await pool.query('UPDATE tasks SET status = ?, completed_at = NOW() WHERE id = ?', [status, taskId]);
    } else {
      await pool.query('UPDATE tasks SET status = ? WHERE id = ?', [status, taskId]);
    }

    res.json({ message: `Task updated to '${status}'` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Employee submits work against an assigned task.
app.post('/tasks/:id/submit-work', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const taskId = req.params.id;
    const { work_title, work_description, work, work_date, work_time, work_duration } = req.body;

    if (!work_title || !work_description || !work || !work_date || !work_time || !work_duration) {
      return res.status(400).json({ message: 'Work title, description, work done, date, time and duration are required' });
    }

    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Task not found' });

    const task = rows[0];
    if (task.employee_id !== employeeId) {
      return res.status(403).json({ message: 'You can only submit work for your own tasks' });
    }
    if (task.status !== 'in_progress') {
      return res.status(400).json({ message: `Work can only be submitted when the task is in progress. Current status: '${task.status}'` });
    }

    await pool.query(
      `UPDATE tasks SET submitted_work_title = ?, submitted_work_description = ?, submitted_work = ?,
       work_date = ?, work_time = ?, work_duration = ?, work_submitted_at = NOW(),
       status = 'completed', completed_at = NOW() WHERE id = ?`,
      [work_title.trim(), work_description.trim(), work.trim(), work_date, work_time, work_duration.trim(), taskId]
    );

    res.json({ message: 'Work submitted successfully', task_id: Number(taskId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

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
app.get('/my-appeals', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM appeals WHERE employee_id = ? ORDER BY created_at DESC', [req.user.employee_id]);
    res.json({ appeals: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/appeals', verifyToken, requireRole('employee'), async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const { task_id, monthly_performance_id, reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Reason is required' });
    if (!task_id && !monthly_performance_id) return res.status(400).json({ message: 'Must provide either task_id or monthly_performance_id' });
    if (task_id && monthly_performance_id) return res.status(400).json({ message: 'Provide only one: task_id OR monthly_performance_id, not both' });

    let appealType = 'monthly_rating';
    if (task_id) {
      const [taskRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [task_id]);
      if (!taskRows.length) return res.status(404).json({ message: 'Task not found' });
      const task = taskRows[0];
      if (task.employee_id !== employeeId) return res.status(403).json({ message: 'You can only appeal your own tasks' });

      if (task.status === 'rejected') appealType = 'task_rejection';
      else if (task.status === 'approved' && task.credit_rating !== null && task.credit_rating <= 3) appealType = 'task_low_credit';
      else if (task.status === 'approved') return res.status(400).json({ message: `This task's credit rating (${task.credit_rating ?? 'none'}/5) is already 4 or above and cannot be appealed` });
      else return res.status(400).json({ message: `Only rejected tasks, or approved tasks with a credit rating of 3 or below, can be appealed. This task is currently '${task.status}'` });

      const [existingRows] = await pool.query("SELECT id FROM appeals WHERE task_id = ? AND status = 'pending'", [task_id]);
      if (existingRows.length) return res.status(400).json({ message: 'There is already a pending appeal for this task' });
    }

    const [result] = await pool.query(
      'INSERT INTO appeals (employee_id, task_id, monthly_performance_id, reason, status, appeal_type) VALUES (?, ?, ?, ?, ?, ?)',
      [employeeId, task_id || null, monthly_performance_id || null, reason, 'pending', appealType]
    );
    res.status(201).json({ message: 'Appeal submitted', appealId: result.insertId, appeal_type: appealType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ========================= MANAGER =========================
app.get('/manager/employees', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT employee_id, department, job_title, assigned_role FROM employee_directory WHERE assigned_role = 'employee' AND resigned = FALSE ORDER BY employee_id ASC`);
    res.json({ employees: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/tasks', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const { employee_id, title, description, due_date } = req.body;
    if (!employee_id || !title || !description || !due_date) return res.status(400).json({ message: 'Employee, title, description and due date are required' });

    const [employeeRows] = await pool.query(
      `SELECT employee_id FROM employee_directory WHERE employee_id = ? AND assigned_role = 'employee' AND resigned = FALSE`,
      [employee_id]
    );
    if (!employeeRows.length) return res.status(400).json({ message: 'Invalid employee selected' });

    const [result] = await pool.query(
      `INSERT INTO tasks (employee_id, assigned_by, title, description, due_date, status, credit_rating, credits_earned)
       VALUES (?, ?, ?, ?, ?, 'assigned', NULL, NULL)`,
      [employee_id, req.user.employee_id, title.trim(), description.trim(), due_date]
    );
    res.status(201).json({ message: 'Work assigned successfully', task_id: result.insertId, employee_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/team-tasks/pending-review', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT tasks.*, COALESCE(users.name, tasks.employee_id) AS employee_name
       FROM tasks LEFT JOIN users ON users.employee_id = tasks.employee_id
       WHERE tasks.assigned_by = ? AND tasks.status = 'completed' ORDER BY tasks.completed_at ASC`,
      [req.user.employee_id]
    );
    res.json({ tasks: rows.map(task => ({ ...task, is_late: task.due_date ? new Date(task.completed_at) > new Date(task.due_date) : null })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.patch('/tasks/:id/review', verifyToken, requireRole('manager'), async (req, res) => {
  try {
    const taskId = req.params.id;
    const { decision, quality_rating, credit_rating, review_notes } = req.body;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    if (!['satisfactory', 'unsatisfactory'].includes(quality_rating)) return res.status(400).json({ message: "quality_rating must be 'satisfactory' or 'unsatisfactory'" });

    let creditRatingValue = null;
    if (decision === 'approved') {
      if (!Number.isInteger(credit_rating) || credit_rating < 1 || credit_rating > 5) return res.status(400).json({ message: 'credit_rating is required when approving and must be an integer from 1 to 5' });
      creditRatingValue = credit_rating;
    }

    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!rows.length) return res.status(404).json({ message: 'Task not found' });
    const task = rows[0];
    if (task.assigned_by !== req.user.employee_id) return res.status(403).json({ message: 'You can only review tasks you assigned' });
    if (task.status !== 'completed') return res.status(400).json({ message: `Task must be 'completed' to review, currently '${task.status}'` });

    let credits = null;
    if (decision === 'approved') {
      const [perfRows] = await pool.query('SELECT performance_score FROM monthly_performance WHERE employee_id = ? ORDER BY month DESC LIMIT 1', [task.employee_id]);
      const latestScore = perfRows.length ? Number(perfRows[0].performance_score) : 50;
      credits = (latestScore / 10).toFixed(2);
    }

    await pool.query('UPDATE tasks SET status = ?, quality_rating = ?, credit_rating = ?, review_notes = ?, credits_earned = ? WHERE id = ?', [decision, quality_rating, creditRatingValue, review_notes || null, credits, taskId]);
    res.json({ message: `Task ${decision}`, credits_earned: credits, credit_rating: creditRatingValue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

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
    const [rows] = await pool.query(`SELECT COUNT(*) AS total_tasks, SUM(status='assigned') AS assigned_tasks, SUM(status='in_progress') AS in_progress_tasks, SUM(status='completed') AS completed_tasks, SUM(status='approved') AS approved_tasks, SUM(status='rejected') AS rejected_tasks FROM tasks WHERE assigned_by = ?`, [req.user.employee_id]);
    const [employeeRows] = await pool.query(`SELECT COUNT(*) AS total_members FROM employee_directory WHERE assigned_role = 'employee'`);
    res.json({
      total_tasks: Number(rows[0].total_tasks || 0), assigned_tasks: Number(rows[0].assigned_tasks || 0),
      in_progress_tasks: Number(rows[0].in_progress_tasks || 0), completed_tasks: Number(rows[0].completed_tasks || 0),
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
      WHERE appeals.status = 'pending' ORDER BY appeals.created_at ASC`
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

Promise.all([ensureTaskColumns(), ensureEmployeeWorkTable()])
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Database setup failed:', err);
    process.exit(1);
  });
