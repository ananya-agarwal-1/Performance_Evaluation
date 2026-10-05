const DEFAULT_WEIGHTS = { task: 0.4, kpi: 0.4, manager: 0.2 };

function getPerformanceClassification(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Very Good';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Needs Improvement';
  return 'Poor';
}

async function getPerformanceWeights(connection) {
  const [rows] = await connection.query(
    'SELECT task_weight, kpi_weight, manager_weight FROM performance_weights WHERE id = 1'
  );
  if (!rows.length) throw new Error('Performance weights configuration is missing');

  const weights = {
    task: Number(rows[0].task_weight),
    kpi: Number(rows[0].kpi_weight),
    manager: Number(rows[0].manager_weight)
  };
  const total = weights.task + weights.kpi + weights.manager;
  if (Object.values(weights).some((weight) => !Number.isFinite(weight) || weight < 0) || Math.abs(total - 1) > 0.0001) {
    throw new Error('Performance weights must be non-negative and sum to 1');
  }
  return weights;
}

function normalizeKpiScore(value) {
  const score = Number(value || 0);
  return Math.max(0, Math.min(100, score <= 5 ? score * 20 : score));
}

async function recalculatePerformance(connection, employeeId, month, managerRatingOverride = null) {
  const weights = await getPerformanceWeights(connection);
  const [[counts]] = await connection.query(
    `SELECT COUNT(*) AS assigned_count,
            SUM(status = 'approved') AS approved_count
     FROM tasks WHERE employee_id = ?`,
    [employeeId]
  );
  const [employeeRows] = await connection.query(
    'SELECT department, latest_job_role, performance_score FROM employee_directory WHERE employee_id = ? FOR UPDATE',
    [employeeId]
  );
  const [performanceRows] = await connection.query(
    'SELECT * FROM monthly_performance WHERE employee_id = ? AND month = ? FOR UPDATE',
    [employeeId, month]
  );

  const employee = employeeRows[0] || {};
  const current = performanceRows[0] || null;
  const taskScore = counts.assigned_count
    ? Number(counts.approved_count || 0) * 100 / Number(counts.assigned_count)
    : 0;
  const kpiScore = normalizeKpiScore(employee.performance_score);
  const managerRating = managerRatingOverride === null
    ? Math.max(0, Math.min(100, Number(current?.manager_rating || 0)))
    : Math.max(0, Math.min(100, Number(managerRatingOverride)));
  const score = Number((taskScore * weights.task + kpiScore * weights.kpi + managerRating * weights.manager).toFixed(2));
  const taskCount = Number(counts.approved_count || 0);
  const classification = getPerformanceClassification(score);

  let performanceId;
  if (current) {
    performanceId = current.id;
    await connection.query(
      `UPDATE monthly_performance
       SET tasks_completed = ?, manager_rating = ?, performance_score = ?, performance_class = ?
       WHERE id = ?`,
      [taskCount, managerRating, score, classification, current.id]
    );
  } else {
    const [result] = await connection.query(
      `INSERT INTO monthly_performance
        (employee_id, month, department, job_role, tasks_completed, manager_rating,
         performance_score, performance_class)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [employeeId, month, employee.department || null, employee.latest_job_role || null,
        taskCount, managerRating, score, classification]
    );
    performanceId = result.insertId;
  }

  return { id: performanceId, score, classification, taskScore: Number(taskScore.toFixed(2)), kpiScore, managerRating, weights };
}

module.exports = {
  DEFAULT_WEIGHTS,
  getPerformanceClassification,
  getPerformanceWeights,
  normalizeKpiScore,
  recalculatePerformance
};