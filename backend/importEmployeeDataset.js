const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const bcrypt = require('bcrypt');
const pool = require('./db');

const root = path.join(__dirname, '..');
const profileFile = path.join(root, 'employee_profile_sample.csv');
const roleFile = path.join(root, 'role_mapping_reference.csv');
const monthlyFile = path.join(root, 'monthly_performance_sample.csv');

function readCSV(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(file).pipe(csv()).on('data', row => rows.push(row)).on('end', () => resolve(rows)).on('error', reject);
  });
}

async function importData() {
  const connection = await pool.getConnection();
  try {
    const [profiles, roles, monthly] = await Promise.all([readCSV(profileFile), readCSV(roleFile), readCSV(monthlyFile)]);
    const roleMap = new Map(roles.map(row => [row.employee_id, row]));
    const password = await bcrypt.hash(process.env.DATASET_DEFAULT_PASSWORD || 'Password@123', 10);
    await connection.beginTransaction();

    for (const employee of profiles) {
      const role = roleMap.get(employee.employee_id);
      if (!role) continue;
      const assignedRole = role.assigned_role === 'senior_authority' ? 'sm' : role.assigned_role;
      await connection.query(`
        INSERT INTO employee_directory (
          employee_id,department,gender,age,job_title,hire_date,years_at_company,education_level,
          performance_score,monthly_salary,work_hours_per_week,projects_handled,overtime_hours,sick_days,
          remote_work_frequency,team_size,training_hours,promotions,employee_satisfaction_score,resigned,
          assigned_role,latest_job_role,avg_performance_score
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE department=VALUES(department),job_title=VALUES(job_title),assigned_role=VALUES(assigned_role),latest_job_role=VALUES(latest_job_role),avg_performance_score=VALUES(avg_performance_score),performance_score=VALUES(performance_score),resigned=VALUES(resigned)`,
        [employee.employee_id,employee.Department,employee.Gender,Number(employee.Age),employee.Job_Title,employee.Hire_Date,Number(employee.Years_At_Company),employee.Education_Level,Number(employee.Performance_Score),Number(employee.Monthly_Salary),Number(employee.Work_Hours_Per_Week),Number(employee.Projects_Handled),Number(employee.Overtime_Hours),Number(employee.Sick_Days),Number(employee.Remote_Work_Frequency),Number(employee.Team_Size),Number(employee.Training_Hours),Number(employee.Promotions),Number(employee.Employee_Satisfaction_Score),String(employee.Resigned).toLowerCase()==='true',assignedRole,role.latest_job_role,Number(role.avg_performance_score)]
      );
      const email = `${employee.employee_id.toLowerCase()}@epms.local`;
      const displayName = `${role.latest_job_role || employee.Job_Title || 'Employee'} ${employee.employee_id}`;
      await connection.query(`INSERT INTO users(employee_id,name,email,password,role) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),role=VALUES(role)`,[employee.employee_id,displayName,email,password,assignedRole]);
    }

    for (const row of monthly) {
      await connection.query(`INSERT INTO monthly_performance(employee_id,department,job_role,education_level,years_at_company,monthly_hours_worked,attendance_rate,training_hours,tasks_completed,peer_review_score,manager_rating,promotions_last_3years,salary_band,work_location,performance_score,performance_class,month) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE department=VALUES(department),job_role=VALUES(job_role),performance_score=VALUES(performance_score),performance_class=VALUES(performance_class),manager_rating=VALUES(manager_rating),tasks_completed=VALUES(tasks_completed),attendance_rate=VALUES(attendance_rate)`,[row.employee_id,row.department,row.job_role,row.education_level,Number(row.years_at_company),Number(row.monthly_hours_worked),Number(row.attendance_rate),row.training_hours===''?null:Number(row.training_hours),Number(row.tasks_completed),row.peer_review_score===''?null:Number(row.peer_review_score),Number(row.manager_rating),Number(row.promotions_last_3years),row.salary_band,row.work_location,Number(row.performance_score),row.performance_class,row.month]);
    }

    // Make the dataset immediately usable: assign each employee to one available manager in the same department.
    await connection.query(`INSERT IGNORE INTO manager_employee_assignments(manager_id,employee_id,assigned_by) SELECT m.employee_id,e.employee_id,m.employee_id FROM employee_directory m JOIN users mu ON mu.employee_id=m.employee_id AND mu.role='manager' JOIN employee_directory e ON e.department=m.department AND e.employee_id<>m.employee_id AND e.resigned=FALSE JOIN users eu ON eu.employee_id=e.employee_id AND eu.role='employee'`);

    await connection.commit();
    console.log(`Imported ${profiles.length} employee profiles, ${monthly.length} monthly performance rows and ${roles.length} role mappings.`);
    console.log(`Dataset accounts use password: ${process.env.DATASET_DEFAULT_PASSWORD || 'Password@123'}`);
  } catch (error) {
    await connection.rollback();
    console.error('Import failed:', error);
    process.exitCode = 1;
  } finally { connection.release(); await pool.end(); }
}
importData();
