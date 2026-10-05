import { apiGet, escapeHTML, setMessage } from './api.js'
import { requireRole, setIdentity } from './auth.js'

const user = await requireRole(['performance_officer'])
if (user) {
    setIdentity()
    try {
        const result = await apiGet('/performance-officer/dashboard')
        const data = result.data || {}
        const stats = data.stats || {}
        document.querySelector('#officer-summary').textContent = `${stats.pending_cases || 0} pending cases of ${stats.total_cases || 0} total cases.`
        document.querySelector('#case-list').innerHTML = (data.cases || []).map((item) => `<tr><td>${Number(item.id)}</td><td>${escapeHTML(item.employee_name || item.employee_id)}</td><td>${escapeHTML(item.reason)}</td><td>${escapeHTML(item.status)}</td><td>${escapeHTML(item.created_at || '-')}</td></tr>`).join('') || '<tr><td colspan="5">No pending cases.</td></tr>'
        document.querySelector('#performance-overview').innerHTML = `<dt>Team Average</dt><dd>${Number(data.teamAverage || 0).toFixed(2)}</dd><dt>Pending Cases</dt><dd>${Number(stats.pending_cases || 0)}</dd><dt>Approved Cases</dt><dd>${Number(stats.approved_cases || 0)}</dd><dt>Rejected Cases</dt><dd>${Number(stats.rejected_cases || 0)}</dd>`
        document.querySelector('#officer-alerts').innerHTML = (data.alerts || []).map((alert) => `<li>${escapeHTML(alert.employee_id)} — score ${escapeHTML(alert.performance_score)} (${escapeHTML(alert.month)})</li>`).join('') || '<li>No performance alerts.</li>'
    } catch (error) {
        setMessage(document.querySelector('#page-message'), error.message)
    }
}
