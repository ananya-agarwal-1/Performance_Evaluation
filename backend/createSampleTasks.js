const pool = require('./db');

async function createSampleData() {
  // A few tasks for our test employee, assigned by the test manager
  const tasks = [
    { employee_id: 'E1002', assigned_by: 'E1000', title: 'Update onboarding docs', status: 'assigned' },
    { employee_id: 'E1002', assigned_by: 'E1000', title: 'Fix login bug', status: 'in_progress' },
    { employee_id: 'E1002', assigned_by: 'E1000', title: 'Prepare Q1 report', status: 'completed' },
    { employee_id: 'E1002', assigned_by: 'E1000', title: 'Client demo prep', status: 'approved', credits_earned: 8.5 },
    { employee_id: 'E1002', assigned_by: 'E1000', title: 'Old task rejected', status: 'rejected' }
  ];

  for (const t of tasks) {
    await pool.query(
      'INSERT INTO tasks (employee_id, assigned_by, title, status, credits_earned) VALUES (?, ?, ?, ?, ?)',
      [t.employee_id, t.assigned_by, t.title, t.status, t.credits_earned || null]
    );
  }
  console.log('Sample tasks created');

  // One active appeal, linked to the rejected task above
  const [rejectedTask] = await pool.query(
    "SELECT id FROM tasks WHERE employee_id = 'E1002' AND status = 'rejected' LIMIT 1"
  );
  const taskId = rejectedTask[0].id;

  await pool.query(
    'INSERT INTO appeals (employee_id, task_id, reason, status) VALUES (?, ?, ?, ?)',
    ['E1002', taskId, 'I believe this task was completed correctly, requesting re-review', 'pending']
  );
  console.log('Sample appeal created');

  process.exit(0);
}

createSampleData().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});