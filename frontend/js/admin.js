import { apiGet, escapeHTML, setMessage } from './api.js'
import { requireRole, setIdentity } from './auth.js'

const user = await requireRole(['admin'])
if (user) {
    setIdentity()
    try {
        const result = await apiGet('/admin/dashboard')
        const data = result.data || {}
        const stats = data.stats || {}
        document.querySelector('#admin-stats').innerHTML = Object.entries(stats).map(([label, value]) => `<dt>${escapeHTML(label.replaceAll('_', ' '))}</dt><dd>${escapeHTML(value)}</dd>`).join('')
        document.querySelector('#recent-users').innerHTML = (data.recentUsers || []).map((account) => `<tr><td>${escapeHTML(account.employee_id)}</td><td>${escapeHTML(account.name)}</td><td>${escapeHTML(account.email)}</td><td>${escapeHTML(account.role)}</td><td>${escapeHTML(account.created_at || '-')}</td></tr>`).join('') || '<tr><td colspan="5">No account records.</td></tr>'
        document.querySelector('#system-summary').textContent = `${stats.total_users || 0} users, ${stats.total_tasks || 0} tasks, and ${stats.pending_appeals || 0} pending appeals.`
    } catch (error) {
        setMessage(document.querySelector('#page-message'), error.message)
    }
}
