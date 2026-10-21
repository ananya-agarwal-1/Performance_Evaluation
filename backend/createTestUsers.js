const bcrypt = require('bcrypt');
const pool = require('./db');

async function createTestUsers() {
  const testUsers = [
    { employee_id: 'E9000', name: 'Demo Manager', email: 'manager@test.com', password: 'manager123', role: 'manager' },
    { employee_id: 'E9001', name: 'Demo Senior Authority', email: 'sm@test.com', password: 'sm123', role: 'sm' },
    { employee_id: 'E1001', name: 'Demo Employee', email: 'employee@test.com', password: 'employee123', role: 'employee' },
    { employee_id: 'E9003', name: 'Demo Performance Officer', email: 'officer@test.com', password: 'officer123', role: 'performance_officer' },
    { employee_id: 'E9004', name: 'Demo Appeal Board', email: 'board@test.com', password: 'board123', role: 'board_member' },
    { employee_id: 'E9005', name: 'Demo Admin', email: 'admin@test.com', password: 'admin123', role: 'admin' }
  ];
  for (const user of testUsers) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    await pool.query(`INSERT INTO users(employee_id,name,email,password,role) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),password=VALUES(password),role=VALUES(role)`, [user.employee_id,user.name,user.email,hashedPassword,user.role]);
    console.log(`Ready: ${user.email} (${user.role}) / ${user.password}`);
  }
  // Give the demo manager a visible team from the imported dataset.
  const [employees] = await pool.query(`SELECT employee_id FROM users WHERE role='employee' ORDER BY employee_id LIMIT 12`);
  for (const e of employees) await pool.query(`INSERT INTO manager_employee_assignments(manager_id,employee_id,assigned_by) VALUES('E9000',?,'E9000') ON DUPLICATE KEY UPDATE active=TRUE`,[e.employee_id]);
  await pool.end();
}
createTestUsers().catch(err=>{console.error('Error creating test users:',err.message);process.exit(1)});
