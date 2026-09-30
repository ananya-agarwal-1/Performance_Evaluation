const bcrypt = require('bcrypt');
const pool = require('./db');

async function createTestUsers() {
  const testUsers = [
    { employee_id: 'E1000', name: 'Test Manager', email: 'manager@test.com', password: 'manager123', role: 'manager' },
    { employee_id: 'E1001', name: 'Test SM', email: 'sm@test.com', password: 'sm123', role: 'sm' },
    { employee_id: 'E1002', name: 'Test Employee', email: 'employee@test.com', password: 'employee123', role: 'employee' }
  ];

  for (const user of testUsers) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    await pool.query(
      'INSERT INTO users (employee_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [user.employee_id, user.name, user.email, hashedPassword, user.role]
    );
    console.log(`Created user: ${user.email} (${user.role})`);
  }

  process.exit(0);
}

createTestUsers().catch(err => {
  console.error('Error creating test users:', err.message);
  process.exit(1);
});