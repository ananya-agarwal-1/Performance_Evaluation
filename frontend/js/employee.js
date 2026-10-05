import { apiGet, apiPatch, apiPost, apiPut, downloadFile, escapeHTML, getUser, setMessage } from './api.js'
import { requireRole, setIdentity } from './auth.js'

const user = await requireRole(['employee'])
if (user) {
    setIdentity()
    document.querySelector('#profile-id').textContent = user.employee_id || '-'
    document.querySelector('#profile-email').textContent = user.email || '-'
    await loadEmployeePage()
}

async function loadEmployeePage() {
    const pageMessage = document.querySelector('#page-message')
    try {
        const [taskData, creditData, notificationData, performanceData, evaluationData, appealData] = await Promise.all([
            apiGet('/my-tasks'),
            apiGet('/api/credits/my'),
            apiGet('/api/notifications/my'),
            apiGet('/api/reviews/performance/my'),
            apiGet('/api/reviews/self'),
            apiGet('/my-appeals')
        ])
        renderTasks(taskData.tasks || [])
        renderCredits(creditData)
        renderNotifications(notificationData.notifications || [])
        renderPerformance(performanceData)
        renderEvaluation(evaluationData.evaluation)
        renderAppeals(appealData.appeals || [])
        setMessage(pageMessage, '')
    } catch (error) {
        setMessage(pageMessage, error.message)
    }
}

function formatDate(value, withTime = false) {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? '-' : date.toLocaleString(undefined, withTime ? {} : { dateStyle: 'medium' })
}

function renderTasks(tasks) {
    const taskRows = document.querySelector('#task-list')
    const recentRows = document.querySelector('#recent-tasks')
    const eligibleTasks = tasks.filter((task) => ['in_progress', 'rejected'].includes(task.status))
    document.querySelector('#summary-completed').textContent = tasks.filter((task) => task.status === 'approved').length
    document.querySelector('#summary-pending').textContent = tasks.filter((task) => !['approved', 'rejected'].includes(task.status)).length
    taskRows.innerHTML = tasks.length ? tasks.map((task) => `
        <tr>
            <td>${escapeHTML(task.title)}</td><td>${escapeHTML(task.description || '-')}</td>
            <td>${escapeHTML(task.assigned_by_name || task.assigned_by)}</td><td>${escapeHTML(task.priority || 'medium')}</td>
            <td>${escapeHTML(formatDate(task.due_date))}</td><td><span class="status ${escapeHTML(task.status)}">${escapeHTML(task.status)}</span></td>
            <td>${taskAction(task)}</td>
        </tr>`).join('') : '<tr><td colspan="7">No assigned tasks.</td></tr>'
    recentRows.innerHTML = tasks.slice(0, 5).map((task) => `
        <tr><td>${escapeHTML(task.title)}</td><td>${escapeHTML(task.priority || 'medium')}</td>
        <td>${escapeHTML(formatDate(task.due_date))}</td><td>${escapeHTML(task.status)}</td>
        <td><a href="#tasks" data-view-task="${Number(task.id)}">View</a></td></tr>`).join('') || '<tr><td colspan="5">No recent tasks.</td></tr>'

    const taskSelect = document.querySelector('#submission-task')
    taskSelect.innerHTML = '<option value="">Select a task</option>' + eligibleTasks.map((task) =>
        `<option value="${Number(task.id)}" data-status="${escapeHTML(task.status)}">${escapeHTML(task.title)} (${escapeHTML(task.status)})</option>`
    ).join('')

    taskRows.querySelectorAll('[data-task-action]').forEach((button) => button.addEventListener('click', async () => {
        const task = tasks.find((item) => Number(item.id) === Number(button.dataset.taskId))
        if (!task) return
        if (button.dataset.taskAction === 'start' || button.dataset.taskAction === 'revise') {
            try {
                await apiPut(`/api/tasks/${task.id}/start`)
                if (button.dataset.taskAction === 'revise') taskSelect.value = String(task.id)
                await loadEmployeePage()
                if (button.dataset.taskAction === 'revise') {
                    document.querySelector('#submission-task').value = String(task.id)
                    document.querySelector('#submission-description').focus()
                }
            } catch (error) {
                setMessage(document.querySelector('#task-message'), error.message)
            }
        } else if (button.dataset.taskAction === 'submit') {
            taskSelect.value = String(task.id)
            document.querySelector('#submission-description').focus()
        } else if (button.dataset.taskAction === 'download') {
            try {
                setMessage(document.querySelector('#task-message'), 'Preparing Excel download…', 'info')
                await downloadFile(`/tasks/${task.id}/work/download`, `work_${task.id}.xlsx`)
                setMessage(document.querySelector('#task-message'), 'Excel file downloaded.', 'success')
            } catch (error) {
                setMessage(document.querySelector('#task-message'), error.message)
            }
        } else {
            const detail = document.querySelector('#task-details')
            const history = task.submissions || []
            detail.innerHTML = `<h3>${escapeHTML(task.title)}</h3><p>${escapeHTML(task.description || 'No description')}</p>
                <p>Assigned by ${escapeHTML(task.assigned_by_name || task.assigned_by)} | ${escapeHTML(task.priority || 'medium')} | Deadline ${escapeHTML(formatDate(task.due_date))}</p>
                ${history.length || task.submitted_work ? `<button type="button" data-download-task-detail="${Number(task.id)}">Download Excel</button>` : ''}
                <h4>Submission History</h4>${history.length ? `<ol>${history.map((entry) => `<li><strong>${escapeHTML(entry.status)}</strong> ${escapeHTML(formatDate(entry.submitted_at, true))}${entry.work_date ? `<p>Date completed: ${escapeHTML(formatDate(entry.work_date))}</p>` : ''}<p>${escapeHTML(entry.submission_description)}</p>${entry.review_comment ? `<p>Manager comment: ${escapeHTML(entry.review_comment)}</p>` : ''}${entry.submission_link ? `<a href="${escapeHTML(entry.submission_link)}" target="_blank" rel="noreferrer">Open work link</a>` : ''}</li>`).join('')}</ol>` : '<p>No submissions yet.</p>'}`
            detail.hidden = false
            detail.querySelector('[data-download-task-detail]')?.addEventListener('click', async () => {
                try {
                    await downloadFile(`/tasks/${task.id}/work/download`, `work_${task.id}.xlsx`)
                    setMessage(document.querySelector('#task-message'), 'Excel file downloaded.', 'success')
                } catch (error) {
                    setMessage(document.querySelector('#task-message'), error.message)
                }
            })
        }
    }))
}

function taskAction(task) {
    if (task.status === 'assigned') return `<button type="button" data-task-action="start" data-task-id="${Number(task.id)}">Start Task</button>`
    if (task.status === 'in_progress') return `<button type="button" data-task-action="submit" data-task-id="${Number(task.id)}">Submit Work</button>`
    if (task.status === 'rejected') {
        const download = task.submitted_work || task.submissions?.length
            ? ` <button type="button" data-task-action="download" data-task-id="${Number(task.id)}">Download Excel</button>`
            : ''
        return `<button type="button" data-task-action="revise" data-task-id="${Number(task.id)}">Revise &amp; Resubmit</button>${download}`
    }
    if (['submitted', 'approved'].includes(task.status)) {
        const status = task.status === 'submitted' ? 'Awaiting Review' : 'Approved'
        const hasSubmission = Boolean(task.submitted_work || task.submissions?.length)
        return `${status}${hasSubmission ? ` <button type="button" data-task-action="download" data-task-id="${Number(task.id)}">Download Excel</button>` : ''}`
    }
    return 'Approved'
}

document.querySelector('#task-submission-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const taskId = form.elements.task_id.value
    const selected = form.elements.task_id.selectedOptions[0]
    const button = form.querySelector('[type="submit"]')
    if (!taskId) return setMessage(document.querySelector('#task-message'), 'Select a task first.')
    button.disabled = true
    try {
        if (selected.dataset.status === 'rejected') await apiPut(`/api/tasks/${taskId}/start`)
        await apiPost(`/api/tasks/${taskId}/submit`, {
            submission_description: form.elements.submission_description.value.trim(),
            submission_link: form.elements.submission_link.value.trim() || undefined,
            work_date: form.elements.work_date.value || undefined
        })
        form.reset()
        setMessage(document.querySelector('#task-message'), 'Work submitted to your manager.', 'success')
        await loadEmployeePage()
    } catch (error) {
        setMessage(document.querySelector('#task-message'), error.message)
    } finally {
        button.disabled = false
    }
})

function renderCredits(data) {
    document.querySelector('#summary-credits').textContent = Number(data.balance || 0).toFixed(2)
}

function renderPerformance(data) {
    const current = data.performance
    const container = document.querySelector('#performance-summary')
    const historyRows = document.querySelector('#performance-history')
    const appealForm = document.querySelector('#appeal-form')
    if (!current) {
        container.innerHTML = '<p>A manager performance review has not been recorded yet.</p>'
        historyRows.innerHTML = '<tr><td colspan="5">No historical performance records.</td></tr>'
        appealForm.hidden = true
        document.querySelector('#summary-score').textContent = 'Not reviewed'
    } else {
        document.querySelector('#summary-score').textContent = `${Number(current.performance_score).toFixed(2)} (${escapeHTML(current.performance_class)})`
        container.innerHTML = `<p class="score">${Number(current.performance_score).toFixed(2)}</p><p>${escapeHTML(current.performance_class)}</p>
            ${meter('Task Performance', current.task_score)}${meter('KPI Achievement', current.kpi_score)}${meter('Manager Rating', current.manager_rating)}`
        historyRows.innerHTML = (data.history || []).map((row) => `<tr><td>${escapeHTML(row.month)}</td><td>${escapeHTML(row.tasks_completed ?? 0)}</td><td>${escapeHTML(row.manager_rating ?? '-')}</td><td>${Number(row.performance_score).toFixed(2)}</td><td>${escapeHTML(row.performance_class || '')}</td></tr>`).join('') || '<tr><td colspan="5">No history.</td></tr>'
        appealForm.hidden = false
        appealForm.dataset.performanceId = String(current.id)
    }

    const feedback = data.feedback
    document.querySelector('#feedback-details').innerHTML = feedback ? `
        <dt>Period</dt><dd>${escapeHTML(feedback.period)}</dd><dt>Manager Rating</dt><dd>${escapeHTML(feedback.manager_rating)}</dd>
        <dt>Strengths</dt><dd>${escapeHTML(feedback.strengths || '-')}</dd><dt>Areas for Improvement</dt><dd>${escapeHTML(feedback.improvement_areas || '-')}</dd>
        <dt>Recommendations</dt><dd>${escapeHTML(feedback.recommendations || '-')}</dd><dt>Comments</dt><dd>${escapeHTML(feedback.comments || '-')}</dd>`
        : '<dt>Review</dt><dd>Feedback appears after your manager completes a review.</dd>'
}

function meter(label, value) {
    const score = Math.max(0, Math.min(100, Number(value || 0)))
    return `<div class="meter-row"><p>${escapeHTML(label)}: ${score.toFixed(2)}</p><div class="meter" role="img" aria-label="${escapeHTML(label)} ${score.toFixed(0)} percent"><span style="width:${score}%"></span></div></div>`
}

document.querySelector('#appeal-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    try {
        const result = await apiPost('/api/appeals', {
            monthly_performance_id: Number(form.dataset.performanceId),
            reason: form.elements.reason.value.trim(),
            evidence: form.elements.evidence.value.trim()
        })
        setMessage(document.querySelector('#appeal-message'), `Appeal ${result.appealId} submitted to ${result.current_level}.`, 'success')
        form.reset()
        await loadEmployeePage()
    } catch (error) {
        setMessage(document.querySelector('#appeal-message'), error.message)
    } finally {
        button.disabled = false
    }
})

function renderEvaluation(evaluation) {
    const form = document.querySelector('#self-evaluation-form')
    const status = document.querySelector('#evaluation-status')
    const map = {
        major_achievements: 'achievements', strengths: 'strengths', challenges: 'challenges',
        goals: 'goals', kpi_progress: 'kpi-progress', additional_comments: 'additional-comments'
    }
    for (const [field, id] of Object.entries(map)) form.elements[field].value = evaluation?.[field] || ''
    const isSubmitted = evaluation?.status === 'submitted'
    status.textContent = evaluation ? `Period ${evaluation.period} | Status: ${evaluation.status}` : 'No evaluation saved for this period.'
    form.querySelectorAll('textarea').forEach((field) => { field.disabled = isSubmitted })
    form.querySelector('#save-draft').hidden = isSubmitted
    form.querySelector('#submit-evaluation').hidden = isSubmitted
}

async function saveEvaluation(action) {
    const form = document.querySelector('#self-evaluation-form')
    const button = action === 'draft' ? form.querySelector('#save-draft') : form.querySelector('#submit-evaluation')
    button.disabled = true
    try {
        const body = Object.fromEntries(new FormData(form).entries())
        body.action = action
        await apiPost('/api/reviews/self', body)
        setMessage(document.querySelector('#evaluation-message'), action === 'draft' ? 'Draft saved.' : 'Evaluation submitted to your manager.', 'success')
        await loadEmployeePage()
    } catch (error) {
        setMessage(document.querySelector('#evaluation-message'), error.message)
    } finally {
        button.disabled = false
    }
}

document.querySelector('#save-draft').addEventListener('click', () => saveEvaluation('draft'))
document.querySelector('#self-evaluation-form').addEventListener('submit', (event) => {
    event.preventDefault()
    saveEvaluation('submit')
})

function renderAppeals(appeals) {
    document.querySelector('#appeal-list').innerHTML = appeals.map((appeal) => `
        <tr><td>${Number(appeal.id)}</td><td>${escapeHTML(appeal.reason)}</td><td>${escapeHTML(formatDate(appeal.created_at))}</td>
        <td>${escapeHTML(appeal.current_level || 'manager')}</td><td>${escapeHTML(appeal.status)}</td></tr>`).join('') || '<tr><td colspan="5">No appeals.</td></tr>'
}

function renderNotifications(notifications) {
    const body = document.querySelector('#notification-list')
    body.innerHTML = notifications.map((item) => `
        <tr class="${item.is_read ? '' : 'notification-unread'}"><td>${escapeHTML(item.title)}</td><td>${escapeHTML(item.message)}</td>
        <td>${escapeHTML(formatDate(item.created_at, true))}</td><td>${item.is_read ? 'Read' : 'Unread'}</td>
        <td>${item.is_read ? '-' : `<button type="button" data-read-id="${Number(item.id)}">Mark Read</button>`}</td></tr>`).join('') || '<tr><td colspan="5">No notifications.</td></tr>'
    body.querySelectorAll('[data-read-id]').forEach((button) => button.addEventListener('click', async () => {
        try {
            await apiPatch(`/api/notifications/${button.dataset.readId}/read`, {})
            await loadEmployeePage()
        } catch (error) {
            setMessage(document.querySelector('#page-message'), error.message)
        }
    }))
}
