// Fills the database with sample work, reviews, credits, appeals, recognitions and notifications
// so every page and report has something to show. Safe to run more than once.
// Run:  npm run demo-data   (after  npm run import-data  and  npm run demo-users)
const pool = require('./db');

const EMP = 'E1001';   // Demo Employee
const MGR = 'E9000';   // Demo Manager

const ago = days => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const dateOnly = d => d.toISOString().slice(0, 10);

async function cleanup() {
  const [old] = await pool.query(`SELECT id FROM work_items WHERE work_reference LIKE 'DEMO-%'`);
  const ids = old.map(r => r.id);
  if (ids.length) {
    const [apps] = await pool.query(`SELECT id FROM performance_appeals WHERE work_id IN (?)`, [ids]);
    const appIds = apps.map(r => r.id);
    if (appIds.length) {
      await pool.query(`DELETE FROM appeal_history WHERE appeal_id IN (?)`, [appIds]);
      await pool.query(`DELETE FROM performance_appeals WHERE id IN (?)`, [appIds]);
    }
    await pool.query(`DELETE FROM work_reviews WHERE work_id IN (?)`, [ids]);
    await pool.query(`DELETE FROM work_credit_transactions WHERE work_id IN (?)`, [ids]);
    await pool.query(`DELETE FROM notifications WHERE entity='work' AND entity_id IN (?)`, [ids]);
    await pool.query(`DELETE FROM work_items WHERE id IN (?)`, [ids]);
  }
  await pool.query(`DELETE FROM recognitions WHERE manager_id=?`, [MGR]);
}

async function addWork(eid, n, w) {
  const ref = `DEMO-${eid}-${String(n).padStart(2, '0')}`;
  const submitted = w.status === 'draft' ? null : ago(w.daysAgo);
  const reviewed = ['approved', 'rejected', 'appealed'].includes(w.status) ? ago(Math.max(w.daysAgo - 2, 0)) : null;
  const due = w.due === undefined ? null : ago(w.due);
  const [r] = await pool.query(
    `INSERT INTO work_items(work_reference,employee_id,assigned_by,work_source,work_type,title,description,work_date,hours_spent,priority,status,review_due_at,submitted_at,reviewed_at,reviewed_by,review_notes,credit_rating,credits_earned,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ref, eid, w.assigned ? MGR : null, w.assigned ? 'assigned' : 'self_submitted', w.type, w.title, w.desc,
     dateOnly(ago(w.daysAgo + 1)), w.hours, w.priority || 'medium', w.status, due, submitted, reviewed,
     reviewed ? MGR : null, w.notes || null, w.rating || null, w.credits || 0, ago(w.daysAgo + 1)]
  );
  const id = r.insertId;
  if (reviewed) {
    const decision = w.status === 'rejected' ? 'rejected' : (w.status === 'appealed' && !w.credits ? 'rejected' : 'approved');
    await pool.query(
      `INSERT INTO work_reviews(work_id,reviewer_id,reviewer_role,decision,credit_rating,credits_earned,comments,created_at) VALUES(?,?,?,?,?,?,?,?)`,
      [id, MGR, 'manager', decision, w.rating || null, w.credits || 0, w.notes || null, reviewed]);
  }
  if (w.credits > 0) {
    await pool.query(
      `INSERT INTO work_credit_transactions(employee_id,work_id,amount,transaction_type,previous_amount,new_amount,reason,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
      [eid, id, w.credits, 'work_approved', 0, w.credits, `Credits for "${w.title}"`, MGR, reviewed]);
  }
  return id;
}

async function addAppeal(eid, workId, n, a) {
  const ref = `APL-DEMO-${String(n).padStart(2, '0')}`;
  const [r] = await pool.query(
    `INSERT INTO performance_appeals(appeal_reference,employee_id,work_id,appeal_type,reason,requested_credit,status,current_level,created_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [ref, eid, workId, a.type, a.reason, a.requested || null, a.status, a.level, ago(a.daysAgo), a.resolved ? ago(a.daysAgo - 1) : null]);
  const id = r.insertId;
  const steps = [['submitted', eid, 'employee', null, null, 'Employee submitted the appeal', 'submitted', ago(a.daysAgo)]];
  for (const s of a.steps || []) steps.push(s.concat([ago(a.daysAgo - 1)]));
  for (const s of steps) {
    await pool.query(
      `INSERT INTO appeal_history(appeal_id,actor_id,actor_role,action,decision,comments,old_status,new_status,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
      [id, s[1], s[2], s[0], s[3], s[5], s[4], s[6], s[7]]);
  }
  return id;
}

async function main() {
  const [chk] = await pool.query(`SELECT employee_id FROM users WHERE employee_id IN (?,?)`, [EMP, MGR]);
  if (chk.length < 2) throw new Error('Demo users are missing. Run: npm run demo-users');

  const [team] = await pool.query(
    `SELECT a.employee_id FROM manager_employee_assignments a JOIN users u ON u.employee_id=a.employee_id
     WHERE a.manager_id=? AND a.active=TRUE AND a.employee_id<>? ORDER BY a.employee_id LIMIT 3`, [MGR, EMP]);
  const others = team.map(t => t.employee_id);

  await cleanup();

  // ---- Demo Employee: a realistic history ----
  const works = [
    { type: 'Project', title: 'Quarterly sales dashboard', desc: 'Built the sales dashboard used in the quarterly review, including charts and filters.', hours: 14, status: 'approved', daysAgo: 70, rating: 5, credits: 5, notes: 'Excellent work, delivered early.' },
    { type: 'Documentation', title: 'API documentation refresh', desc: 'Updated the API documentation and added request and response examples.', hours: 6, status: 'approved', daysAgo: 58, rating: 4, credits: 4, notes: 'Clear and complete.' },
    { type: 'Report', title: 'Customer onboarding report', desc: 'Prepared a report on onboarding delays with suggestions to fix them.', hours: 8, status: 'approved', daysAgo: 49, rating: 3, credits: 3, notes: 'Good report, a few sections were thin.' },
    { type: 'Development', title: 'Payment module bug fixes', desc: 'Found and fixed five bugs in the payment module and added tests.', hours: 12, status: 'approved', daysAgo: 40, rating: 4, credits: 4, notes: 'Solid fixes.', assigned: true },
    { type: 'Research', title: 'Q3 research summary', desc: 'Read recent research papers and wrote a summary for the team.', hours: 10, status: 'approved', daysAgo: 33, rating: 5, credits: 5, notes: 'Very useful summary.' },
    { type: 'Research', title: 'Vendor comparison study', desc: 'Compared three vendors on price, support and features.', hours: 9, status: 'approved', daysAgo: 26, rating: 2, credits: 2, notes: 'Missing the price comparison table.' },
    { type: 'Team Contribution', title: 'Team training session notes', desc: 'Took notes in the training session and shared them with the team.', hours: 3, status: 'appealed', daysAgo: 20, rating: null, credits: 0, notes: 'Evidence file was missing.' },
    { type: 'Presentation', title: 'Client presentation deck', desc: 'Prepared the slides for the client progress meeting.', hours: 7, status: 'submitted', daysAgo: 4, due: -2 },
    { type: 'Testing', title: 'Load testing of the new API', desc: 'Ran load tests on the new API and recorded the results.', hours: 11, status: 'under_review', daysAgo: 6, due: -1, assigned: true },
    { type: 'Other', title: 'Release checklist', desc: 'Draft checklist for the next release.', hours: 2, status: 'draft', daysAgo: 1 }
  ];
  const ids = [];
  for (let i = 0; i < works.length; i++) ids.push(await addWork(EMP, i + 1, works[i]));

  // appeal for the work with missing evidence (waiting for the senior authority)
  await addAppeal(EMP, ids[6], 1, {
    type: 'work_rejection', status: 'under_senior_review', level: 'senior_authority', daysAgo: 12,
    reason: 'I did attach the notes document. Please check the evidence again.',
    steps: [['review_started', 'E9001', 'senior_authority', null, 'submitted', 'Looking into the evidence now', 'under_senior_review']]
  });

  // ---- Other team members, so manager and senior pages have data ----
  const extra = [
    { type: 'Development', title: 'Login page redesign', desc: 'Redesigned the login page for the internal tool.', hours: 8, status: 'approved', daysAgo: 30, rating: 4, credits: 4, notes: 'Looks good.' },
    { type: 'Testing', title: 'Regression test suite', desc: 'Wrote regression tests for the billing module.', hours: 9, status: 'submitted', daysAgo: 5, due: 1 },
    { type: 'Report', title: 'Monthly support summary', desc: 'Summary of support tickets for last month.', hours: 4, status: 'submitted', daysAgo: 7, due: 3 },
    { type: 'Assignment', title: 'Inventory data cleanup', desc: 'Cleaned duplicate rows from the inventory sheet.', hours: 5, status: 'rejected', daysAgo: 22, rating: null, credits: 0, notes: 'Cleanup was incomplete.' }
  ];
  const rejectedIds = [];
  for (let k = 0; k < others.length; k++) {
    const eid = others[k];
    let n = 1;
    for (const w of extra) {
      const id = await addWork(eid, n++, w);
      if (w.status === 'rejected') rejectedIds.push([eid, id]);
    }
  }
  // an appeal waiting at the senior level, and one at the board level
  if (rejectedIds[0]) {
    await addAppeal(rejectedIds[0][0], rejectedIds[0][1], 2, {
      type: 'work_rejection', status: 'under_senior_review', level: 'senior_authority', daysAgo: 9,
      reason: 'The cleanup covered every duplicate in the sheet. I would like a second review.',
      steps: [['manager_upheld', MGR, 'manager', 'upheld', 'submitted', 'Rejection stands, but the employee can escalate', 'escalated'],
              ['escalated', rejectedIds[0][0], 'employee', null, 'escalated', 'Escalated to senior authority', 'under_senior_review']]
    });
    await pool.query(`UPDATE work_items SET status='appealed' WHERE id=?`, [rejectedIds[0][1]]);
  }
  if (rejectedIds[1]) {
    await addAppeal(rejectedIds[1][0], rejectedIds[1][1], 3, {
      type: 'work_rejection', status: 'under_board_review', level: 'board', daysAgo: 14,
      reason: 'Both the manager and the senior review missed the attached data.',
      steps: [['manager_upheld', MGR, 'manager', 'upheld', 'submitted', 'Manager kept the decision', 'escalated'],
              ['senior_upheld', 'E9001', 'senior_authority', 'upheld', 'escalated', 'Senior kept the decision, escalated to board', 'under_board_review']]
    });
    await pool.query(`UPDATE work_items SET status='appealed' WHERE id=?`, [rejectedIds[1][1]]);
  }

  // ---- Recognitions (these are the employee's achievements) ----
  const recs = [
    [EMP, 'Employee of the Month', 'Employee of the Month', 'Consistently high quality work and always willing to help the team.', 45],
    [EMP, 'Excellence', 'Quarterly dashboard delivered early', 'The sales dashboard was delivered ahead of schedule and was used in the board review.', 66],
    [EMP, 'Teamwork', 'Great team support', 'Stayed late to help the team finish the release.', 38],
    [EMP, 'Innovation', 'Better onboarding report', 'Found a simple way to cut onboarding delays.', 47],
    [EMP, 'Appreciation', 'Thank you for the research summary', 'The summary saved the team several hours of reading.', 31]
  ];
  for (const o of others) recs.push([o, 'Appreciation', 'Thank you for your support', 'Helpful during the last release.', 20]);
  for (const r of recs) {
    await pool.query(`INSERT INTO recognitions(employee_id,manager_id,category,title,message,created_at) VALUES(?,?,?,?,?,?)`, [r[0], MGR, r[1], r[2], r[3], ago(r[4])]);
  }

  // ---- Notifications ----
  const notes = [
    [ids[0], 'Work approved', 'Your work "Quarterly sales dashboard" was approved with 5 credits.', 1, 68],
    [ids[3], 'Work approved', 'Your work "Payment module bug fixes" was approved with 4 credits.', 1, 38],
    [ids[5], 'Work approved', 'Your work "Vendor comparison study" was approved with 2 credits.', 0, 24],
    [ids[6], 'Appeal received', 'Your appeal for "Team training session notes" is with the senior authority.', 0, 12],
    [ids[7], 'Work submitted', 'Your work "Client presentation deck" is waiting for review.', 0, 4]
  ];
  for (const n of notes) {
    await pool.query(`INSERT INTO notifications(recipient_id,title,message,entity,entity_id,is_read,created_at) VALUES(?,?,?,?,?,?,?)`, [EMP, n[1], n[2], 'work', n[0], n[3], ago(n[4])]);
  }

  console.log('Demo data ready.');
  console.log(`  Employee ${EMP}: ${works.length} work items, 1 appeal, ${recs.filter(r => r[0] === EMP).length} recognitions, ${notes.length} notifications`);
  console.log(`  Other team members: ${others.join(', ') || '(none found)'}`);
  await pool.end();
}

main().catch(err => { console.error('Demo data failed:', err.message); process.exit(1); });
