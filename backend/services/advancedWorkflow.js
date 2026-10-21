const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verifyToken, requireRole: checkRole } = require('../middleware/auth');
// every role-protected route here also needs the token checked first
const requireRole = (...roles) => [verifyToken, checkRole(...roles)];

const ALLOWED_WORK_TYPES = [
  'Project', 'Assignment', 'Research', 'Report', 'Presentation',
  'Development', 'Testing', 'Documentation', 'Client Work',
  'Team Contribution', 'Other'
];

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.ppt', '.pptx', '.doc', '.docx', '.xls', '.xlsx', '.csv',
  '.zip', '.png', '.jpg', '.jpeg'
]);

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/zip',
  'image/png',
  'image/jpeg'
]);

const MAX_FILE_BYTES = Number(process.env.MAX_WORK_FILE_SIZE_MB || 25) * 1024 * 1024;
const UPLOAD_ROOT = path.resolve(process.env.WORK_UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'work'));

function clean(value, max = 10000) {
  return String(value ?? '').trim().slice(0, max);
}

function roleName(req) {
  return req.user?.role === 'sm' ? 'senior_authority' : req.user?.role;
}

async function ensureAdvancedSchema(pool) {
  await pool.query(`
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
    ) ENGINE=InnoDB
  `);

  await pool.query(`
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
      INDEX work_status_idx (status, created_at),
      INDEX work_reviewer_idx (reviewed_by),
      INDEX work_assigned_by_idx (assigned_by)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
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
    ) ENGINE=InnoDB
  `);

  await pool.query(`
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
    ) ENGINE=InnoDB
  `);

  await pool.query(`
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
      INDEX credit_employee_idx (employee_id, created_at),
      INDEX credit_work_idx (work_id, created_at)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_appeals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      appeal_reference VARCHAR(30) NOT NULL UNIQUE,
      employee_id VARCHAR(50) NOT NULL,
      work_id INT NULL,
      appeal_type ENUM('work_rejection','low_credit','performance_score','incorrect_attribution','other') NOT NULL DEFAULT 'other',
      reason TEXT NOT NULL,
      requested_credit TINYINT NULL,
      status ENUM(
        'submitted','under_manager_review','manager_upheld','manager_overturned',
        'escalated','under_senior_review','senior_upheld','senior_overturned',
        'escalated_to_board','under_board_review','approved','rejected','closed'
      ) NOT NULL DEFAULT 'submitted',
      current_level ENUM('manager','senior_authority','board') NOT NULL DEFAULT 'manager',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      resolved_at DATETIME NULL,
      INDEX appeal_employee_idx (employee_id, created_at),
      INDEX appeal_level_idx (current_level, status),
      INDEX appeal_work_idx (work_id)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
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
    ) ENGINE=InnoDB
  `);

  await pool.query(`
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
    ) ENGINE=InnoDB
  `);

  await pool.query(`
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
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    INSERT IGNORE INTO manager_employee_assignments (manager_id, employee_id, assigned_by)
    SELECT m.employee_id, e.employee_id, m.employee_id
    FROM employee_directory m
    JOIN users mu ON mu.employee_id = m.employee_id AND mu.role = 'manager'
    JOIN employee_directory e ON e.department = m.department AND e.employee_id <> m.employee_id AND e.resigned = FALSE
    JOIN users eu ON eu.employee_id = e.employee_id AND eu.role = 'employee'
  `);

  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

async function isManagerForEmployee(pool, managerId, employeeId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT 1 FROM manager_employee_assignments
     WHERE manager_id = ? AND employee_id = ? AND active = TRUE LIMIT 1`,
    [managerId, employeeId]
  );
  return rows.length > 0;
}

async function canViewWork(pool, req, work) {
  const role = roleName(req);
  if (role === 'employee') return work.employee_id === req.user.employee_id;
  if (role === 'manager') return await isManagerForEmployee(pool, req.user.employee_id, work.employee_id);
  if (['performance_officer','senior_authority','board_member','admin'].includes(role)) return true;
  return false;
}

function makeReference(prefix) {
  return `${prefix}-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function parseBase64File(file) {
  if (!file || typeof file !== 'object') throw new Error('File is required');
  const original = clean(file.original_filename || file.filename, 255);
  const mime = clean(file.mime_type || file.type, 150).toLowerCase();
  const dataUrl = String(file.data || '');
  const ext = path.extname(original).toLowerCase();
  if (!original || !ALLOWED_EXTENSIONS.has(ext)) throw new Error('Unsupported file type');
  if (!ALLOWED_MIME.has(mime)) throw new Error('Unsupported MIME type');
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  if (!base64) throw new Error('File data is empty');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new Error('Invalid file data');
  if (buffer.length > MAX_FILE_BYTES) throw new Error(`File exceeds ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)} MB limit`);
  return { original, mime, ext, buffer };
}

async function insertFile(pool, table, entityId, req, file) {
  const parsed = parseBase64File(file);
  const stored = `${crypto.randomUUID()}${parsed.ext}`;
  const fullPath = path.join(UPLOAD_ROOT, stored);
  fs.writeFileSync(fullPath, parsed.buffer, { flag: 'wx' });
  const tableName = table === 'work_files' ? 'work_files' : 'appeal_files';
  const idColumn = tableName === 'work_files' ? 'work_id' : 'appeal_id';
  const [result] = await pool.query(
    `INSERT INTO ${tableName} (${idColumn}, original_filename, stored_filename, file_path, mime_type, file_size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [entityId, parsed.original, stored, fullPath, parsed.mime, parsed.buffer.length, req.user.employee_id]
  );
  return { id: result.insertId, original_filename: parsed.original, mime_type: parsed.mime, file_size: parsed.buffer.length };
}

async function addHistory(connection, appealId, req, action, decision, comments, oldStatus, newStatus) {
  await connection.query(
    `INSERT INTO appeal_history
      (appeal_id, actor_id, actor_role, action, decision, comments, old_status, new_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [appealId, req.user.employee_id, roleName(req), action, decision || null, comments || null, oldStatus || null, newStatus || null]
  );
}

function installAdvancedWorkflow(app, pool, helpers) {
  const { createNotification, writeAudit } = helpers;

  // Employee: create self-submitted work.
  app.post('/api/work', requireRole('employee'), async (req, res) => {
    const employeeId = req.user.employee_id;
    const body = req.body || {};
    const workType = clean(body.work_type, 60);
    const title = clean(body.title, 255);
    const description = clean(body.description, 10000);
    const workDate = clean(body.work_date, 10);
    const hours = body.hours_spent === '' || body.hours_spent == null ? null : Number(body.hours_spent);
    if (!ALLOWED_WORK_TYPES.includes(workType)) return res.status(400).json({ message: 'Invalid work type' });
    if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return res.status(400).json({ message: 'Work type, title, description and work date are required' });
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) return res.status(400).json({ message: 'hours_spent must be between 0 and 24' });
    try {
      const reference = makeReference('WRK');
      const [result] = await pool.query(
        `INSERT INTO work_items (work_reference, employee_id, work_source, work_type, title, description, work_date, hours_spent, status, review_due_at)
         VALUES (?, ?, 'self_submitted', ?, ?, ?, ?, ?, 'draft', DATE_ADD(NOW(), INTERVAL 3 DAY))`,
        [reference, employeeId, workType, title, description, workDate, hours]
      );
      
      res.status(201).json({ success: true, work: { id: result.insertId, work_reference: reference, employee_id: employeeId, work_type: workType, title, description, work_date: workDate, hours_spent: hours, status: 'draft' } });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Failed to create work' }); }
  });

  app.get('/api/work/my', requireRole('employee'), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT w.*, (SELECT COUNT(*) FROM work_files f WHERE f.work_id = w.id AND f.is_deleted = FALSE) AS file_count
         FROM work_items w WHERE w.employee_id = ? ORDER BY w.created_at DESC`, [req.user.employee_id]
      );
      res.json({ success: true, work: rows });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Failed to load work' }); }
  });

  app.get('/api/work/:id', verifyToken, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT w.*, COALESCE(u.name, w.employee_id) AS employee_name FROM work_items w LEFT JOIN users u ON u.employee_id = w.employee_id WHERE w.id = ?`, [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ message: 'Work not found' });
      if (!(await canViewWork(pool, req, rows[0]))) return res.status(403).json({ message: 'You are not allowed to view this work' });
      const [files] = await pool.query(`SELECT id, original_filename, mime_type, file_size, uploaded_at FROM work_files WHERE work_id = ? AND is_deleted = FALSE ORDER BY uploaded_at`, [req.params.id]);
      const [reviews] = await pool.query(`SELECT id, reviewer_id, reviewer_role, decision, credit_rating, credits_earned, comments, created_at FROM work_reviews WHERE work_id = ? ORDER BY created_at`, [req.params.id]);
      res.json({ success: true, work: rows[0], files, reviews });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Failed to load work' }); }
  });

  app.post('/api/work/:id/files', requireRole('employee'), async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM work_items WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: 'Work not found' });
      if (rows[0].employee_id !== req.user.employee_id) return res.status(403).json({ message: 'You can only attach files to your own work' });
      if (['approved','closed'].includes(rows[0].status)) return res.status(409).json({ message: 'Approved/closed work cannot be modified' });
      const file = await insertFile(pool, 'work_files', req.params.id, req, req.body.file);
      await writeAudit(pool, req.user.employee_id, 'FILE_UPLOADED', 'work', Number(req.params.id), { file_id: file.id, filename: file.original_filename });
      res.status(201).json({ success: true, file });
    } catch (err) { console.error(err); res.status(400).json({ message: err.message || 'Failed to upload file' }); }
  });

  app.get('/api/work/:id/files/:fileId/download', verifyToken, async (req, res) => {
    try {
      const [rows] = await pool.query(`SELECT w.employee_id, f.* FROM work_files f JOIN work_items w ON w.id = f.work_id WHERE f.id = ? AND f.work_id = ? AND f.is_deleted = FALSE`, [req.params.fileId, req.params.id]);
      if (!rows.length) return res.status(404).json({ message: 'File not found' });
      if (!(await canViewWork(pool, req, rows[0]))) return res.status(403).json({ message: 'You are not allowed to download this file' });
      if (!fs.existsSync(rows[0].file_path)) return res.status(404).json({ message: 'Stored file is missing' });
      await writeAudit(pool, req.user.employee_id, 'FILE_DOWNLOADED', 'work', Number(req.params.id), { file_id: Number(req.params.fileId) });
      res.download(rows[0].file_path, rows[0].original_filename);
    } catch (err) { console.error(err); res.status(500).json({ message: 'Failed to download file' }); }
  });

  // Manager employee directory and assignments.
  app.get('/api/manager/employees', requireRole('manager'), async (req, res) => {
    try {
      const search = clean(req.query.search, 100);
      const department = clean(req.query.department, 100);
      const designation = clean(req.query.designation, 100);
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const params = [req.user.employee_id];
      let sql = `SELECT u.employee_id, u.name, u.email, ed.department, ed.latest_job_role AS designation,
                        ed.performance_score, mea.assigned_at
                 FROM manager_employee_assignments mea
                 JOIN users u ON u.employee_id = mea.employee_id
                 LEFT JOIN employee_directory ed ON ed.employee_id = mea.employee_id
                 WHERE mea.manager_id = ? AND mea.active = TRUE`;
      if (search) { sql += ` AND (u.employee_id LIKE ? OR u.name LIKE ? OR u.email LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      if (department) { sql += ` AND ed.department = ?`; params.push(department); }
      if (designation) { sql += ` AND ed.latest_job_role = ?`; params.push(designation); }
      sql += ` ORDER BY u.name LIMIT ? OFFSET ?`; params.push(limit, offset);
      const [rows] = await pool.query(sql, params);
      res.json({ success: true, employees: rows, pagination: { limit, offset } });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Failed to load manager employees' }); }
  });

  app.post('/api/manager/employees/:employeeId/assign', requireRole('manager'), async (req, res) => {
    try {
      const employeeId = clean(req.params.employeeId, 50);
      if (employeeId === req.user.employee_id) return res.status(400).json({ message: 'A manager cannot assign themselves' });
      const [employee] = await pool.query(`SELECT u.employee_id FROM users u WHERE u.employee_id = ? AND u.role = 'employee'`, [employeeId]);
      if (!employee.length) return res.status(404).json({ message: 'Employee not found' });
      await pool.query(`INSERT INTO manager_employee_assignments (manager_id, employee_id, assigned_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE active = TRUE`, [req.user.employee_id, employeeId, req.user.employee_id]);
      await writeAudit(pool, req.user.employee_id, 'EMPLOYEE_ASSIGNED', 'employee', 0, { employee_id: employeeId });
      res.json({ success: true, message: 'Employee assigned to manager' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Failed to assign employee' }); }
  });

  // Manager creates assigned work.
  app.post('/api/manager/work', requireRole('manager'), async (req, res) => {
    const body = req.body || {};
    const employeeId = clean(body.employee_id, 50);
    const workType = clean(body.work_type, 60);
    const title = clean(body.title, 255);
    const description = clean(body.description, 10000);
    const workDate = clean(body.work_date || new Date().toISOString().slice(0, 10), 10);
    const hours = body.estimated_hours === '' || body.estimated_hours == null ? null : Number(body.estimated_hours);
    const priority = ['low','medium','high','critical'].includes(body.priority) ? body.priority : 'medium';
    if (!employeeId || !ALLOWED_WORK_TYPES.includes(workType) || !title || !description) return res.status(400).json({ message: 'Employee, work type, title and description are required' });
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) return res.status(400).json({ message: 'estimated_hours must be between 0 and 24' });
    try {
      if (!(await isManagerForEmployee(pool, req.user.employee_id, employeeId))) return res.status(403).json({ message: 'Employee is not assigned to this manager' });
      const reference = makeReference('WRK');
      const [result] = await pool.query(
        `INSERT INTO work_items (work_reference, employee_id, assigned_by, work_source, work_type, title, description, work_date, hours_spent, priority, deadline, status, review_due_at)
         VALUES (?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?, ?, 'draft', DATE_ADD(NOW(), INTERVAL 3 DAY))`,
        [reference, employeeId, req.user.employee_id, workType, title, description, workDate, hours, priority, body.deadline || null]
      );
      await createNotification(pool, employeeId, 'New work assigned', `${title} was assigned to you.`, 'work', result.insertId);
      await writeAudit(pool, req.user.employee_id, 'WORK_ASSIGNED', 'work', result.insertId, { employee_id: employeeId, work_reference: reference });
      res.status(201).json({ success: true, work_id: result.insertId, work_reference: reference });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Failed to assign work' }); }
  });

  app.post('/api/work/:id/submit', requireRole('employee'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT * FROM work_items WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!rows.length) { await connection.rollback(); return res.status(404).json({ message: 'Work not found' }); }
      const work = rows[0];
      if (work.employee_id !== req.user.employee_id) { await connection.rollback(); return res.status(403).json({ message: 'You can only submit your own work' }); }
      if (!['draft','rejected'].includes(work.status)) { await connection.rollback(); return res.status(409).json({ message: `Work cannot be submitted from '${work.status}' state` }); }
      const [files] = await connection.query('SELECT id FROM work_files WHERE work_id = ? AND is_deleted = FALSE LIMIT 1', [work.id]);
      if (!files.length) { await connection.rollback(); return res.status(400).json({ message: 'Upload at least one work evidence file before submission' }); }
      await connection.query(`UPDATE work_items SET status='submitted', submitted_at=NOW(), review_due_at=DATE_ADD(NOW(), INTERVAL 3 DAY) WHERE id=?`, [work.id]);
      const [managers] = await connection.query(`SELECT manager_id FROM manager_employee_assignments WHERE employee_id = ? AND active = TRUE`, [work.employee_id]);
      for (const row of managers) await createNotification(connection, row.manager_id, 'Work ready for review', `${work.title} is ready for review.`, 'work', work.id);
      await writeAudit(connection, req.user.employee_id, 'WORK_SUBMITTED', 'work', work.id, {});
      await connection.commit();
      res.json({ success: true, status: 'submitted' });
    } catch (err) { await connection.rollback(); console.error(err); res.status(500).json({ message: 'Failed to submit work' }); }
    finally { connection.release(); }
  });

  // Manager review.
  app.get('/api/manager/work/pending', requireRole('manager'), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT w.*, u.name AS employee_name,
                (SELECT COUNT(*) FROM work_files f WHERE f.work_id=w.id AND f.is_deleted=FALSE) AS file_count
         FROM work_items w JOIN users u ON u.employee_id=w.employee_id
         WHERE w.status IN ('submitted','under_review')
           AND EXISTS (SELECT 1 FROM manager_employee_assignments m WHERE m.manager_id=? AND m.employee_id=w.employee_id AND m.active=TRUE)
         ORDER BY w.submitted_at ASC`, [req.user.employee_id]
      );
      res.json({ success: true, work: rows });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Failed to load pending work' }); }
  });

  app.post('/api/manager/work/:id/review', requireRole('manager'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT * FROM work_items WHERE id=? FOR UPDATE', [req.params.id]);
      if (!rows.length) { await connection.rollback(); return res.status(404).json({ message: 'Work not found' }); }
      const work = rows[0];
      if (!(await isManagerForEmployee(pool, req.user.employee_id, work.employee_id, connection))) { await connection.rollback(); return res.status(403).json({ message: 'You are not assigned to this employee' }); }
      if (!['submitted','under_review'].includes(work.status)) { await connection.rollback(); return res.status(409).json({ message: `Work is already '${work.status}'` }); }
      const decision = clean(req.body.decision, 30);
      const comments = clean(req.body.comments || req.body.review_notes, 10000);
      const rating = Number(req.body.credit_rating);
      if (!['approved','rejected','needs_revision'].includes(decision)) { await connection.rollback(); return res.status(400).json({ message: 'Invalid decision' }); }
      if (decision === 'rejected' && !comments) { await connection.rollback(); return res.status(400).json({ message: 'Comments are required when rejecting work' }); }
      if (decision === 'approved' && (!Number.isInteger(rating) || rating < 1 || rating > 5)) { await connection.rollback(); return res.status(400).json({ message: 'credit_rating must be an integer from 1 to 5' }); }
      let credits = 0;
      if (decision === 'approved') credits = Number((rating * 2).toFixed(2));
      const nextStatus = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'draft';
      await connection.query(`UPDATE work_items SET status=?, reviewed_at=NOW(), reviewed_by=?, review_notes=?, credit_rating=?, credits_earned=? WHERE id=?`, [nextStatus, req.user.employee_id, comments || null, decision === 'approved' ? rating : null, credits, work.id]);
      await connection.query(`INSERT INTO work_reviews (work_id, reviewer_id, reviewer_role, decision, credit_rating, credits_earned, comments) VALUES (?, ?, 'manager', ?, ?, ?, ?)`, [work.id, req.user.employee_id, decision, decision === 'approved' ? rating : null, credits, comments || null]);
      if (decision === 'approved') {
        await connection.query(`INSERT INTO work_credit_transactions (employee_id, work_id, amount, transaction_type, previous_amount, new_amount, reason, actor_id) VALUES (?, ?, ?, 'work_approved', 0, ?, ?, ?)`, [work.employee_id, work.id, credits, credits, comments || 'Manager approved work', req.user.employee_id]);
      }
      await createNotification(connection, work.employee_id, `Work ${decision}`, `${work.title} was ${decision} by your manager.`, 'work', work.id);
      await writeAudit(connection, req.user.employee_id, 'WORK_REVIEWED', 'work', work.id, { decision, credit_rating: decision === 'approved' ? rating : null, credits });
      await connection.commit();
      res.json({ success: true, work_id: work.id, status: nextStatus, credits_earned: credits });
    } catch (err) { await connection.rollback(); console.error(err); res.status(500).json({ message: 'Failed to review work' }); }
    finally { connection.release(); }
  });

  // Employee creates an appeal.
  app.post('/api/performance-appeals', requireRole('employee'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const workId = Number(req.body.work_id);
      const reason = clean(req.body.reason, 10000);
      const type = ['work_rejection','low_credit','performance_score','incorrect_attribution','other'].includes(req.body.appeal_type) ? req.body.appeal_type : 'other';
      const requestedCredit = req.body.requested_credit == null || req.body.requested_credit === '' ? null : Number(req.body.requested_credit);
      if (!Number.isInteger(workId) || !reason) return res.status(400).json({ message: 'work_id and reason are required' });
      await connection.beginTransaction();
      const [workRows] = await connection.query('SELECT * FROM work_items WHERE id=? FOR UPDATE', [workId]);
      if (!workRows.length) { await connection.rollback(); return res.status(404).json({ message: 'Work not found' }); }
      const work = workRows[0];
      if (work.employee_id !== req.user.employee_id) { await connection.rollback(); return res.status(403).json({ message: 'You can only appeal your own work' }); }
      if (!['approved','rejected','disputed'].includes(work.status)) { await connection.rollback(); return res.status(409).json({ message: 'Only reviewed work can be appealed' }); }
      const [existing] = await connection.query(`SELECT id FROM performance_appeals WHERE work_id=? AND employee_id=? AND status NOT IN ('closed','rejected','approved')`, [workId, req.user.employee_id]);
      if (existing.length) { await connection.rollback(); return res.status(409).json({ message: 'An active appeal already exists for this work' }); }
      const reference = makeReference('APL');
      // Appeals go straight to the senior authority (no manager step).
      const initialStatus = 'under_senior_review';
      const initialLevel = 'senior_authority';
      const [result] = await connection.query(`INSERT INTO performance_appeals (appeal_reference, employee_id, work_id, appeal_type, reason, requested_credit, status, current_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [reference, req.user.employee_id, workId, type, reason, requestedCredit, initialStatus, initialLevel]);
      await connection.query(`UPDATE work_items SET status='appealed' WHERE id=?`, [workId]);
      await addHistory(connection, result.insertId, req, 'APPEAL_CREATED', null, reason, null, initialStatus);
      const [seniorRows] = await connection.query(`SELECT employee_id FROM users WHERE role IN ('sm','senior_authority')`);
      for (const row of seniorRows) await createNotification(connection, row.employee_id, 'New appeal for senior review', `${reference} was submitted and needs a senior decision.`, 'performance_appeal', result.insertId);
      await writeAudit(connection, req.user.employee_id, 'APPEAL_CREATED', 'performance_appeal', result.insertId, { work_id: workId, appeal_reference: reference });
      await connection.commit();
      res.status(201).json({ success: true, appeal_id: result.insertId, appeal_reference: reference, status: initialStatus });
    } catch (err) { await connection.rollback(); console.error(err); res.status(500).json({ message: 'Failed to create appeal' }); }
    finally { connection.release(); }
  });

  app.get('/api/performance-appeals/my', requireRole('employee'), async (req, res) => {
    try { const [rows] = await pool.query(`SELECT a.*, w.title AS work_title, w.credit_rating, w.credits_earned FROM performance_appeals a LEFT JOIN work_items w ON w.id=a.work_id WHERE a.employee_id=? ORDER BY a.created_at DESC`, [req.user.employee_id]); res.json({ success:true, appeals:rows }); }
    catch (err) { console.error(err); res.status(500).json({ message:'Failed to load appeals' }); }
  });

  // Manager appeal queue. Conflict-of-interest is enforced.
  app.get('/api/manager/appeals', requireRole('manager'), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT a.*, u.name AS employee_name, w.title AS work_title, w.description AS work_description, w.credit_rating, w.credits_earned
         FROM performance_appeals a JOIN users u ON u.employee_id=a.employee_id LEFT JOIN work_items w ON w.id=a.work_id
         WHERE a.current_level='manager' AND a.status='under_manager_review'
           AND EXISTS (SELECT 1 FROM manager_employee_assignments m WHERE m.manager_id=? AND m.employee_id=a.employee_id AND m.active=TRUE)
           AND NOT EXISTS (SELECT 1 FROM work_items wx WHERE wx.id=a.work_id AND wx.reviewed_by=? AND wx.employee_id=a.employee_id)
         ORDER BY a.created_at`, [req.user.employee_id, req.user.employee_id]
      );
      res.json({ success:true, appeals:rows });
    } catch (err) { console.error(err); res.status(500).json({ message:'Failed to load manager appeals' }); }
  });

  async function resolveAppeal(req, res, level) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT * FROM performance_appeals WHERE id=? FOR UPDATE', [req.params.id]);
      if (!rows.length) { await connection.rollback(); return res.status(404).json({ message:'Appeal not found' }); }
      const appeal = rows[0];
      const expected = level === 'manager' ? ['manager','under_manager_review'] : level === 'senior_authority' ? ['senior_authority','under_senior_review'] : ['board','under_board_review'];
      if (appeal.current_level !== expected[0] || appeal.status !== expected[1]) { await connection.rollback(); return res.status(409).json({ message:'Appeal is not at your review level' }); }
      if (appeal.employee_id === req.user.employee_id) { await connection.rollback(); return res.status(403).json({ message:'Conflict of interest: you cannot resolve your own appeal' }); }
      if (level === 'manager') {
        if (!(await isManagerForEmployee(pool, req.user.employee_id, appeal.employee_id, connection))) { await connection.rollback(); return res.status(403).json({ message:'Employee is not assigned to you' }); }
        const [workRows] = await connection.query('SELECT reviewed_by FROM work_items WHERE id=?', [appeal.work_id]);
        if (workRows[0]?.reviewed_by === req.user.employee_id) { await connection.rollback(); return res.status(403).json({ message:'Conflict of interest: original reviewer cannot resolve this appeal' }); }
      }
      const decision = clean(req.body.decision, 40);
      const comments = clean(req.body.comments, 10000);
      const allowed = level === 'manager' ? ['uphold','modify','escalate'] : ['uphold','modify','escalate'];
      if (!allowed.includes(decision) || !comments) { await connection.rollback(); return res.status(400).json({ message:'Valid decision and comments are required' }); }
      let newStatus;
      let newLevel = appeal.current_level;
      if (decision === 'escalate') {
        if (level === 'manager') { newStatus='under_senior_review'; newLevel='senior_authority'; }
        else if (level === 'senior_authority') { newStatus='under_board_review'; newLevel='board'; }
        else { newStatus='closed'; }
      } else {
        if (level === 'manager') newStatus = decision === 'modify' ? 'manager_overturned' : 'manager_upheld';
        else if (level === 'senior_authority') newStatus = decision === 'modify' ? 'senior_overturned' : 'senior_upheld';
        else newStatus = decision === 'modify' ? 'approved' : 'rejected';
      }
      await connection.query(`UPDATE performance_appeals SET status=?, current_level=?, resolved_at=? WHERE id=?`, [newStatus, newLevel, decision === 'escalate' ? null : new Date(), appeal.id]);
      await addHistory(connection, appeal.id, req, `${level.toUpperCase()}_DECISION`, decision, comments, appeal.status, newStatus);
      if (decision === 'modify' && appeal.work_id) {
        const requested = Number(req.body.new_credit_rating);
        if (Number.isInteger(requested) && requested >= 1 && requested <= 5) {
          const [workRows] = await connection.query('SELECT * FROM work_items WHERE id=? FOR UPDATE', [appeal.work_id]);
          if (workRows.length) {
            const old = Number(workRows[0].credits_earned || 0);
            const credits = Number((requested * 2).toFixed(2));
            await connection.query('UPDATE work_items SET credit_rating=?, credits_earned=?, status=? WHERE id=?', [requested, credits, level === 'board' ? 'closed' : 'approved', appeal.work_id]);
            await connection.query(`INSERT INTO work_credit_transactions (employee_id, work_id, amount, transaction_type, previous_amount, new_amount, reason, actor_id) VALUES (?, ?, ?, 'appeal_adjustment', ?, ?, ?, ?)`, [appeal.employee_id, appeal.work_id, credits-old, old, credits, `Appeal ${appeal.appeal_reference} modified credit`, req.user.employee_id]);
          }
        }
      }
      const recipients = [];
      if (decision === 'escalate') {
        if (newLevel === 'senior_authority') { const [r] = await connection.query(`SELECT employee_id FROM users WHERE role='sm' OR role='senior_authority'`); recipients.push(...r.map(x=>x.employee_id)); }
        if (newLevel === 'board') { const [r] = await connection.query(`SELECT employee_id FROM users WHERE role='board_member'`); recipients.push(...r.map(x=>x.employee_id)); }
      }
      for (const id of recipients) await createNotification(connection, id, 'Appeal requires review', `${appeal.appeal_reference} has been escalated to you.`, 'performance_appeal', appeal.id);
      await createNotification(connection, appeal.employee_id, 'Appeal updated', `${appeal.appeal_reference} is now ${newStatus}.`, 'performance_appeal', appeal.id);
      await writeAudit(connection, req.user.employee_id, 'APPEAL_RESOLVED', 'performance_appeal', appeal.id, { level, decision, new_status:newStatus });
      await connection.commit();
      res.json({ success:true, appeal_id:appeal.id, status:newStatus, current_level:newLevel });
    } catch (err) { await connection.rollback(); console.error(err); res.status(500).json({ message:'Failed to resolve appeal' }); }
    finally { connection.release(); }
  }

  app.patch('/api/manager/appeals/:id/resolve', requireRole('manager'), (req,res)=>resolveAppeal(req,res,'manager'));

  app.get('/api/senior/appeals', requireRole('senior_authority'), async (req,res)=>{
    try { const [rows]=await pool.query(`SELECT a.*,u.name AS employee_name,w.title AS work_title,w.description AS work_description,w.credit_rating,w.credits_earned FROM performance_appeals a JOIN users u ON u.employee_id=a.employee_id LEFT JOIN work_items w ON w.id=a.work_id WHERE a.current_level='senior_authority' AND a.status='under_senior_review' ORDER BY a.created_at`); res.json({success:true,appeals:rows}); }
    catch(err){console.error(err);res.status(500).json({message:'Failed to load senior appeals'});}
  });
  app.patch('/api/senior/appeals/:id/resolve', requireRole('senior_authority'), (req,res)=>resolveAppeal(req,res,'senior_authority'));

  app.get('/api/board/appeals', requireRole('board_member'), async (req,res)=>{
    try { const [rows]=await pool.query(`SELECT a.*,u.name AS employee_name,w.title AS work_title,w.description AS work_description,w.credit_rating,w.credits_earned FROM performance_appeals a JOIN users u ON u.employee_id=a.employee_id LEFT JOIN work_items w ON w.id=a.work_id WHERE a.current_level='board' AND a.status='under_board_review' ORDER BY a.created_at`); res.json({success:true,appeals:rows}); }
    catch(err){console.error(err);res.status(500).json({message:'Failed to load board appeals'});}
  });
  app.patch('/api/board/appeals/:id/resolve', requireRole('board_member'), (req,res)=>resolveAppeal(req,res,'board'));

  // Secure file upload for appeals using JSON base64 payloads.
  app.post('/api/performance-appeals/:id/files', requireRole('employee'), async (req,res)=>{
    try {
      const [rows]=await pool.query('SELECT employee_id FROM performance_appeals WHERE id=?',[req.params.id]);
      if(!rows.length) return res.status(404).json({message:'Appeal not found'});
      if(rows[0].employee_id!==req.user.employee_id) return res.status(403).json({message:'You can only attach files to your own appeal'});
      const file=await insertFile(pool,'appeal_files',req.params.id,req,req.body.file);
      await writeAudit(pool,req.user.employee_id,'FILE_UPLOADED','performance_appeal',Number(req.params.id),{file_id:file.id,filename:file.original_filename});
      res.status(201).json({success:true,file});
    }catch(err){console.error(err);res.status(400).json({message:err.message||'Failed to upload appeal file'});}
  });

  app.get('/api/performance-appeals/:id/files/:fileId/download', verifyToken, async (req,res)=>{
    try {
      const [rows]=await pool.query(`SELECT a.employee_id,f.* FROM appeal_files f JOIN performance_appeals a ON a.id=f.appeal_id WHERE f.id=? AND f.appeal_id=? AND f.is_deleted=FALSE`,[req.params.fileId,req.params.id]);
      if(!rows.length)return res.status(404).json({message:'File not found'});
      const role=roleName(req);
      const allowed=rows[0].employee_id===req.user.employee_id || ['manager','performance_officer','senior_authority','board_member','admin'].includes(role);
      if(!allowed)return res.status(403).json({message:'You are not allowed to download this file'});
      if(!fs.existsSync(rows[0].file_path))return res.status(404).json({message:'Stored file is missing'});
      await writeAudit(pool,req.user.employee_id,'FILE_DOWNLOADED','performance_appeal',Number(req.params.id),{file_id:Number(req.params.fileId)});
      res.download(rows[0].file_path,rows[0].original_filename);
    }catch(err){console.error(err);res.status(500).json({message:'Failed to download appeal file'});}
  });

  // Reports and review alerts.
  app.get('/api/performance-officer/work', requireRole('performance_officer','senior_authority','board_member','admin'), async (req,res)=>{
    try { const [rows]=await pool.query(`SELECT w.*,u.name AS employee_name,ed.department,ed.latest_job_role AS designation FROM work_items w JOIN users u ON u.employee_id=w.employee_id LEFT JOIN employee_directory ed ON ed.employee_id=w.employee_id ORDER BY w.created_at DESC LIMIT 200`); res.json({success:true,work:rows}); }
    catch(err){console.error(err);res.status(500).json({message:'Failed to load work'});}
  });

  app.get('/api/performance-officer/alerts', requireRole('performance_officer','admin'), async (req,res)=>{
    try {
      await pool.query(`INSERT INTO review_alerts (employee_id,manager_id,alert_type,description,severity,entity_type,entity_id) SELECT w.employee_id,w.reviewed_by,'OVERDUE_REVIEW',CONCAT('Work ',w.work_reference,' has been awaiting review for more than 3 days'),'medium','work',w.id FROM work_items w WHERE w.status IN ('submitted','under_review') AND w.review_due_at < NOW() AND NOT EXISTS (SELECT 1 FROM review_alerts a WHERE a.entity_type='work' AND a.entity_id=w.id AND a.alert_type='OVERDUE_REVIEW' AND a.status='open')`);
      const [rows]=await pool.query(`SELECT * FROM review_alerts WHERE status='open' ORDER BY created_at DESC LIMIT 200`); res.json({success:true,alerts:rows});
    }catch(err){console.error(err);res.status(500).json({message:'Failed to load alerts'});}
  });

  app.get('/api/reports/work-contributions', requireRole('performance_officer','senior_authority','board_member','admin'), async (req,res)=>{
    try {
      const [rows]=await pool.query(`SELECT u.employee_id,u.name,COUNT(w.id) AS work_count,SUM(w.status='approved') AS approved_count,COALESCE(SUM(w.credits_earned),0) AS credits,COALESCE(AVG(w.credit_rating),0) AS avg_rating FROM users u JOIN work_items w ON w.employee_id=u.employee_id WHERE u.role='employee' GROUP BY u.employee_id,u.name ORDER BY credits DESC`); res.json({success:true,report:rows});
    }catch(err){console.error(err);res.status(500).json({message:'Failed to generate work report'});}
  });

  app.get('/api/reports/appeals', requireRole('performance_officer','senior_authority','board_member','admin'), async (req,res)=>{
    try { const [rows]=await pool.query(`SELECT current_level,status,COUNT(*) AS count FROM performance_appeals GROUP BY current_level,status ORDER BY current_level,status`); res.json({success:true,report:rows}); }
    catch(err){console.error(err);res.status(500).json({message:'Failed to generate appeal report'});}
  });
}

module.exports = { ensureAdvancedSchema, installAdvancedWorkflow, ALLOWED_WORK_TYPES };
