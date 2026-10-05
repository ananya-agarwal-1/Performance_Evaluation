import { apiGet, apiPatch, escapeHTML, setMessage } from './api.js'
import { requireRole, setIdentity } from './auth.js'

const user = await requireRole(['senior_authority', 'sm'])
let selectedAppeal = null
if (user) {
    setIdentity()
    await loadSeniorPage()
}

async function loadSeniorPage() {
    try {
        const [appealResult, analyticsResult] = await Promise.all([
            apiGet('/appeals/pending'),
            apiGet('/dashboard/analytics')
        ])
        const appeals = appealResult.appeals || []
        document.querySelector('#senior-appeals').innerHTML = appeals.map((appeal) => `<tr>
            <td>${Number(appeal.id)}</td><td>${escapeHTML(appeal.employee_name || appeal.employee_id)}</td>
            <td>${escapeHTML(appeal.reason)}</td><td>${escapeHTML(appeal.appeal_type)}</td><td>${escapeHTML(appeal.created_at || '-')}</td>
            <td><button type="button" data-open-appeal="${Number(appeal.id)}">Review</button></td></tr>`).join('') || '<tr><td colspan="6">No appeals have reached this authority level.</td></tr>'
        document.querySelectorAll('[data-open-appeal]').forEach((button) => button.addEventListener('click', () => {
            selectedAppeal = appeals.find((appeal) => Number(appeal.id) === Number(button.dataset.openAppeal))
            document.querySelector('#selected-appeal-id').textContent = selectedAppeal?.id || ''
            document.querySelector('#appeal-resolution').hidden = !selectedAppeal
        }))
        const data = analyticsResult.data || {}
        document.querySelector('#department-list').innerHTML = (data.departmentComparison || []).map((row) => `<tr><td>${escapeHTML(row.name)}</td><td>${Number(row.score || 0).toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="2">No department performance data.</td></tr>'
        document.querySelector('#trend-list').innerHTML = (data.monthlyTrend || []).map((row) => `<tr><td>${escapeHTML(row.month)}</td><td>${Number(row.avg_score || 0).toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="2">No performance history.</td></tr>'
    } catch (error) {
        setMessage(document.querySelector('#page-message'), error.message)
    }
}

async function resolveAppeal(decision) {
    if (!selectedAppeal) return
    const notes = document.querySelector('#resolution-notes').value.trim()
    if (!notes) return setMessage(document.querySelector('#resolution-message'), 'Resolution notes are required.')
    try {
        await apiPatch(`/appeals/${selectedAppeal.id}/resolve`, {
            decision,
            resolution_notes: notes,
            new_credit_rating: document.querySelector('#new-credit-rating').value ? Number(document.querySelector('#new-credit-rating').value) : undefined
        })
        setMessage(document.querySelector('#resolution-message'), `Appeal ${decision}.`, 'success')
        selectedAppeal = null
        document.querySelector('#appeal-resolution').hidden = true
        await loadSeniorPage()
    } catch (error) {
        setMessage(document.querySelector('#resolution-message'), error.message)
    }
}

document.querySelector('#resolve-appeal').addEventListener('click', () => resolveAppeal('approved'))
document.querySelector('#reject-appeal').addEventListener('click', () => resolveAppeal('rejected'))
