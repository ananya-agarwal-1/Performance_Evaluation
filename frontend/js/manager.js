import { apiGet, apiPatch, apiPost, downloadFile, escapeHTML, setMessage } from './api.js'
import { requireRole, setIdentity } from './auth.js'

const manager = await requireRole(['manager'])
let team = []
let pendingTasks = []
let selectedTask = null
if (manager) {
    setIdentity()
    document.querySelector('#profile-id').textContent = manager.employee_id || '-'
    document.querySelector('#profile-email').textContent = manager.email || '-'
    await loadManagerPage()
}

async function loadManagerPage() {
    try {
        const [employeesData, reviewData, taskData, notificationData] = await Promise.all([
            apiGet('/manager/employees'),
            apiGet('/api/reviews/manager/team'),
            apiGet('/team-tasks/pending-review'),
            apiGet('/api/notifications/my')
        ])
        team = reviewData.employees || []
        pendingTasks = taskData.tasks || []
        populateEmployees(employeesData.employees || [])
        renderTeam(team)
        renderPendingTasks(pendingTasks)
        renderNotifications(notificationData.notifications || [])
        document.querySelector('#team-count').textContent = team.length
        document.querySelector('#task-review-count').textContent = pendingTasks.length
        document.querySelector('#evaluation-count').textContent = team.filter((employee) => employee.self_evaluation_status === 'submitted' && employee.review_status !== 'submitted').length
        setMessage(document.querySelector('#page-message'), '')
    } catch (error) {
        setMessage(document.querySelector('#page-message'), error.message)
    }
}

function formatDate(value) {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? '-' : date.toLocaleString()
}

function populateEmployees(employees) {
    document.querySelector('#employee-id').innerHTML = '<option value="">Select an employee</option>' + employees.map((employee) =>
        `<option value="${escapeHTML(employee.employee_id)}">${escapeHTML(employee.employee_id)} — ${escapeHTML(employee.job_title || employee.department || '')}</option>`
    ).join('')
}

function renderTeam(employees) {
    const teamRows = employees.map((employee) => `
        <tr><td>${escapeHTML(employee.name)} (${escapeHTML(employee.employee_id)})</td><td>${escapeHTML(employee.department)}</td>
        <td>${employee.current_performance == null ? 'Not reviewed' : Number(employee.current_performance).toFixed(2)}</td>
        <td>${Number(employee.task_score).toFixed(2)}</td><td>${Number(employee.kpi_score).toFixed(2)}</td>
        <td>${escapeHTML(employee.self_evaluation_status)}</td><td>${escapeHTML(employee.review_status)}</td></tr>`).join('') || '<tr><td colspan="7">No employees in your permitted department team.</td></tr>'
    document.querySelector('#team-list').innerHTML = teamRows
    document.querySelector('#team-actions').innerHTML = employees.map((employee) => `
        <tr><td>${escapeHTML(employee.name)} (${escapeHTML(employee.employee_id)})</td><td>${escapeHTML(employee.department)}</td>
        <td>${employee.current_performance == null ? 'Not reviewed' : Number(employee.current_performance).toFixed(2)}</td>
        <td>${escapeHTML(employee.self_evaluation_status)}</td><td>${escapeHTML(employee.review_status)}</td>
        <td>${employee.self_evaluation_status === 'submitted' ? `<button type="button" data-open-review="${escapeHTML(employee.employee_id)}">Open Review</button>` : 'Waiting for employee evaluation'}</td></tr>`).join('') || '<tr><td colspan="6">No employees in your permitted department team.</td></tr>'
    document.querySelector('#review-team-list').innerHTML = employees.map((employee) => `
        <tr><td>${escapeHTML(employee.name)} (${escapeHTML(employee.employee_id)})</td><td>${escapeHTML(employee.department)}</td>
        <td>${employee.current_performance == null ? 'Not reviewed' : Number(employee.current_performance).toFixed(2)}</td>
        <td>${Number(employee.task_score).toFixed(2)}</td><td>${Number(employee.kpi_score).toFixed(2)}</td>
        <td>${escapeHTML(employee.self_evaluation_status)}</td><td>${escapeHTML(employee.review_status)}</td>
        <td>${employee.self_evaluation_status === 'submitted' ? `<button type="button" data-open-review="${escapeHTML(employee.employee_id)}">Review</button>` : 'Not submitted'}</td></tr>`).join('') || '<tr><td colspan="8">No reviewable employees.</td></tr>'
    document.querySelectorAll('[data-open-review]').forEach((button) => button.addEventListener('click', () => openEmployeeReview(button.dataset.openReview)))
}

function renderPendingTasks(tasks) {
    document.querySelector('#pending-task-list').innerHTML = tasks.map((task) => `
        <tr><td>${escapeHTML(task.employee_name || task.employee_id)}</td><td>${escapeHTML(task.title)}</td>
        <td>${escapeHTML(task.submission_description || task.submitted_work_description || task.submitted_work || '-')}</td>
        <td>${escapeHTML(formatDate(task.submitted_at || task.work_submitted_at))}</td><td>${escapeHTML(formatDate(task.due_date))}</td>
        <td>${escapeHTML(task.priority || 'medium')}</td><td><button type="button" data-review-task="${Number(task.id)}">View</button></td></tr>`).join('') || '<tr><td colspan="7">No task submissions are awaiting review.</td></tr>'
    document.querySelectorAll('[data-review-task]').forEach((button) => button.addEventListener('click', () => openTaskReview(Number(button.dataset.reviewTask))))
}

document.querySelector('#assignment-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    try {
        const response = await apiPost('/tasks', {
            employee_id: form.elements.employee_id.value,
            title: form.elements.title.value.trim(),
            description: form.elements.description.value.trim(),
            priority: form.elements.priority.value,
            due_date: form.elements.due_date.value
        })
        setMessage(document.querySelector('#assignment-message'), `Task ${response.task.id} assigned to ${response.task.employee_id}.`, 'success')
        form.reset()
        await loadManagerPage()
    } catch (error) {
        setMessage(document.querySelector('#assignment-message'), error.message)
    } finally {
        button.disabled = false
    }
})

function openTaskReview(taskId) {
    selectedTask = pendingTasks.find((task) => Number(task.id) === taskId)
    if (!selectedTask) return
    const hasSubmission = Boolean(selectedTask.submission_id || selectedTask.submission_description ||
        selectedTask.submitted_work_title || selectedTask.submitted_work_description || selectedTask.submitted_work)
    document.querySelector('#task-review-title').textContent = `Review: ${selectedTask.title}`
    document.querySelector('#task-review-info').innerHTML = `
        <dt>Employee</dt><dd>${escapeHTML(selectedTask.employee_name || selectedTask.employee_id)}</dd>
        <dt>Task</dt><dd>${escapeHTML(selectedTask.title)}</dd><dt>Description</dt><dd>${escapeHTML(selectedTask.description || '-')}</dd>
        <dt>Submission</dt><dd>${escapeHTML(selectedTask.submission_description || selectedTask.submitted_work_description || selectedTask.submitted_work || '-')}</dd>
        <dt>Submitted At</dt><dd>${escapeHTML(formatDate(selectedTask.submitted_at || selectedTask.work_submitted_at))}</dd>
        <dt>Deadline</dt><dd>${escapeHTML(formatDate(selectedTask.due_date))}</dd><dt>Priority</dt><dd>${escapeHTML(selectedTask.priority || 'medium')}</dd>`
    document.querySelector('#missing-submission-warning').hidden = hasSubmission
    document.querySelector('#download-task-work').hidden = !hasSubmission
    document.querySelector('#task-review-form').hidden = !hasSubmission
    document.querySelector('#task-review-detail').hidden = false
    document.querySelector('#task-review-message').textContent = ''
    location.hash = 'task-reviews'
}

document.querySelector('#download-task-work').addEventListener('click', async () => {
    if (!selectedTask) return
    try {
        await downloadFile(`/tasks/${selectedTask.id}/work/download`, `work_${selectedTask.id}.xlsx`)
        setMessage(document.querySelector('#task-review-message'), 'Excel file downloaded.', 'success')
    } catch (error) {
        setMessage(document.querySelector('#task-review-message'), error.message)
    }
})

async function decideTask(decision) {
    if (!selectedTask) return
    if (!selectedTask.submission_id && !selectedTask.submission_description && !selectedTask.submitted_work_title && !selectedTask.submitted_work_description && !selectedTask.submitted_work) {
        return setMessage(document.querySelector('#task-review-message'), 'This task has no stored submission content and cannot be reviewed.')
    }
    const comment = document.querySelector('#task-review-comment').value.trim()
    if (decision === 'rejected' && !comment) return setMessage(document.querySelector('#task-review-message'), 'A rejection comment is required.')
    try {
        const result = await apiPost(`/api/tasks/${selectedTask.id}/review`, {
            decision,
            comment: decision === 'rejected' ? comment : (comment || undefined),
            credit_rating: Number(document.querySelector('#review-credit-rating').value)
        })
        setMessage(document.querySelector('#task-review-message'), decision === 'approved' ? `Approved. ${Number(result.credits_earned).toFixed(2)} credits awarded.` : 'Task rejected with manager comment.', 'success')
        selectedTask = null
        await loadManagerPage()
    } catch (error) {
        setMessage(document.querySelector('#task-review-message'), error.message)
    }
}

document.querySelector('#approve-task').addEventListener('click', () => decideTask('approved'))
document.querySelector('#reject-task').addEventListener('click', () => decideTask('rejected'))

document.querySelector('#close-review').addEventListener('click', () => {
    document.querySelector('#performance-review-detail').hidden = true
})

async function openEmployeeReview(employeeId) {
    const detail = document.querySelector('#performance-review-detail')
    setMessage(document.querySelector('#manager-review-message'), 'Loading employee review…', 'info')
    try {
        const data = await apiGet(`/api/reviews/manager/${encodeURIComponent(employeeId)}`)
        const employee = data.employee
        document.querySelector('#performance-review-title').textContent = `${employee.name} (${employee.employee_id})`
        document.querySelector('#employee-review-summary').innerHTML = `<p>Department: ${escapeHTML(employee.department)} | Designation: ${escapeHTML(employee.job_title || '-')}</p>
            <p>Task Performance: ${Number(data.task_score).toFixed(2)} | KPI Achievement: ${Number(employee.kpi_score).toFixed(2)}</p>`
        const evaluation = data.self_evaluation
        document.querySelector('#self-evaluation-detail').innerHTML = evaluation ? `
            <dt>Period and Status</dt><dd>${escapeHTML(evaluation.period)} — ${escapeHTML(evaluation.status)}</dd>
            <dt>Major Achievements</dt><dd>${escapeHTML(evaluation.major_achievements)}</dd><dt>Strengths</dt><dd>${escapeHTML(evaluation.strengths)}</dd>
            <dt>Challenges</dt><dd>${escapeHTML(evaluation.challenges)}</dd><dt>Goals</dt><dd>${escapeHTML(evaluation.goals)}</dd>
            <dt>KPI Progress</dt><dd>${escapeHTML(evaluation.kpi_progress)}</dd><dt>Additional Comments</dt><dd>${escapeHTML(evaluation.additional_comments || '-')}</dd>`
            : '<dt>Self Evaluation</dt><dd>Not submitted</dd>'
        document.querySelector('#manager-performance-history').innerHTML = (data.performance_history || []).map((item) => `
            <tr><td>${escapeHTML(item.month)}</td><td>${escapeHTML(item.tasks_completed ?? 0)}</td><td>${escapeHTML(item.manager_rating ?? '-')}</td><td>${Number(item.performance_score).toFixed(2)}</td><td>${escapeHTML(item.performance_class || '')}</td></tr>`).join('') || '<tr><td colspan="5">No previous monthly records.</td></tr>'
        document.querySelector('#previous-reviews').innerHTML = (data.previous_reviews || []).map((review) => `
            <tr><td>${escapeHTML(review.period)}</td><td>${escapeHTML(review.manager_rating)}</td><td>${escapeHTML(review.strengths || '-')}</td><td>${escapeHTML(review.improvement_areas || '-')}</td><td>${escapeHTML(review.comments || '-')}</td></tr>`).join('') || '<tr><td colspan="5">No previous manager reviews.</td></tr>'
        document.querySelector('#review-employee-id').value = employeeId
        const current = data.previous_reviews.find((review) => review.period === data.period)
        document.querySelector('#manager-rating').value = current?.manager_rating ?? ''
        document.querySelector('#review-strengths').value = current?.strengths || ''
        document.querySelector('#improvement-areas').value = current?.improvement_areas || ''
        document.querySelector('#recommendations').value = current?.recommendations || ''
        document.querySelector('#manager-comments').value = current?.comments || ''
        detail.hidden = false
        document.querySelector('#manager-review-message').textContent = ''
        location.hash = 'reviews'
    } catch (error) {
        setMessage(document.querySelector('#manager-review-message'), error.message)
    }
}

document.querySelector('#manager-review-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    try {
        const result = await apiPost('/api/reviews/manager', Object.fromEntries(new FormData(form).entries()))
        setMessage(document.querySelector('#manager-review-message'), `Review saved. Official performance score: ${Number(result.performance.score).toFixed(2)} (${result.performance.classification}).`, 'success')
        await loadManagerPage()
    } catch (error) {
        setMessage(document.querySelector('#manager-review-message'), error.message)
    } finally {
        button.disabled = false
    }
})

function renderNotifications(notifications) {
    const body = document.querySelector('#notification-list')
    body.innerHTML = notifications.map((item) => `
        <tr><td>${escapeHTML(item.title)}</td><td>${escapeHTML(item.message)}</td><td>${escapeHTML(formatDate(item.created_at))}</td>
        <td>${item.is_read ? 'Read' : 'Unread'}</td><td>${item.is_read ? '-' : `<button type="button" data-mark-read="${Number(item.id)}">Mark Read</button>`}</td></tr>`).join('') || '<tr><td colspan="5">No notifications.</td></tr>'
    body.querySelectorAll('[data-mark-read]').forEach((button) => button.addEventListener('click', async () => {
        try {
            await apiPatch(`/api/notifications/${button.dataset.markRead}/read`, {})
            await loadManagerPage()
        } catch (error) {
            setMessage(document.querySelector('#page-message'), error.message)
        }
    }))
}
