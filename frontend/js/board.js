import { apiGet, escapeHTML, setMessage } from './api.js'
import { requireRole, setIdentity } from './auth.js'

const user = await requireRole(['board_member'])
if (user) {
    setIdentity()
    try {
        const result = await apiGet('/appeal-board/dashboard')
        const data = result.data || {}
        document.querySelector('#board-cases').innerHTML = (data.cases || []).map((appeal) => `<tr>
            <td>${Number(appeal.id)}</td><td>${escapeHTML(appeal.employee_name || appeal.employee_id)}</td>
            <td>${escapeHTML(appeal.reason)}</td><td>${escapeHTML(appeal.status)}</td><td>${escapeHTML(appeal.created_at || '-')}</td></tr>`).join('') || '<tr><td colspan="5">No board cases are available.</td></tr>'
        document.querySelector('#board-history').innerHTML = (data.recentDecisions || []).map((decision) => `<tr><td>${escapeHTML(decision.employee_name || '-')}</td><td>${escapeHTML(decision.status)}</td><td>${escapeHTML(decision.created_at || '-')}</td></tr>`).join('') || '<tr><td colspan="3">No final decisions.</td></tr>'
    } catch (error) {
        setMessage(document.querySelector('#page-message'), error.message)
    }
}
