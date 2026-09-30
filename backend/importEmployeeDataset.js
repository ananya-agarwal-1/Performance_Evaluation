const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const pool = require('./db');

const profileFile = path.join(__dirname, '../employee_profile_sample.csv');
const roleFile = path.join(__dirname, '../role_mapping_reference.csv');

function readCSV(file) {
    return new Promise((resolve, reject) => {
        const rows = [];

        fs.createReadStream(file)
            .pipe(csv())
            .on('data', row => rows.push(row))
            .on('end', () => resolve(rows))
            .on('error', reject);
    });
}

async function importData() {
    try {
        const profiles = await readCSV(profileFile);
        const roles = await readCSV(roleFile);

        const roleMap = new Map(
            roles.map(row => [row.employee_id, row])
        );

        for (const employee of profiles) {
            const role = roleMap.get(employee.employee_id);

            if (!role) {
                continue;
            }

            await pool.query(
                `
                INSERT INTO employee_directory (
                    employee_id,
                    department,
                    gender,
                    age,
                    job_title,
                    hire_date,
                    years_at_company,
                    education_level,
                    performance_score,
                    monthly_salary,
                    work_hours_per_week,
                    projects_handled,
                    overtime_hours,
                    sick_days,
                    remote_work_frequency,
                    team_size,
                    training_hours,
                    promotions,
                    employee_satisfaction_score,
                    resigned,
                    assigned_role,
                    latest_job_role,
                    avg_performance_score
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    department = VALUES(department),
                    job_title = VALUES(job_title),
                    assigned_role = VALUES(assigned_role),
                    latest_job_role = VALUES(latest_job_role),
                    avg_performance_score = VALUES(avg_performance_score)
                `,
                [
                    employee.employee_id,
                    employee.Department,
                    employee.Gender,
                    Number(employee.Age),
                    employee.Job_Title,
                    employee.Hire_Date,
                    Number(employee.Years_At_Company),
                    employee.Education_Level,
                    Number(employee.Performance_Score),
                    Number(employee.Monthly_Salary),
                    Number(employee.Work_Hours_Per_Week),
                    Number(employee.Projects_Handled),
                    Number(employee.Overtime_Hours),
                    Number(employee.Sick_Days),
                    Number(employee.Remote_Work_Frequency),
                    Number(employee.Team_Size),
                    Number(employee.Training_Hours),
                    Number(employee.Promotions),
                    Number(employee.Employee_Satisfaction_Score),
                    employee.Resigned === 'True',
                    role.assigned_role,
                    role.latest_job_role,
                    Number(role.avg_performance_score)
                ]
            );
        }

        console.log('Employee dataset imported successfully.');
        console.log(`Imported ${profiles.length} employee profiles.`);

        await pool.end();

    } catch (error) {
        console.error('Import failed:', error);
        process.exit(1);
    }
}

importData();