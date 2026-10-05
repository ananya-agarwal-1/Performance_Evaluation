import { apiGet, getUser } from './api.js'

const rolePages = {
    employee: 'employee.html',
    manager: 'manager.html',
    sm: 'senior.html',
    senior_authority: 'senior.html',
    performance_officer: 'officer.html',
    board_member: 'board.html',
    admin: 'admin.html'
}

export function pageForRole(role) {
    return rolePages[role] || 'login.html'
}

export async function requireRole(roles) {
    const user = getUser()
    if (!localStorage.getItem('token') || !roles.includes(user.role)) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.replace('login.html')
        return null
    }

    try {
        const session = await apiGet('/api/auth/me')
        if (session.data?.user?.employee_id !== user.employee_id || session.data?.user?.role !== user.role) throw new Error('Session mismatch')
        return user
    } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.replace('login.html')
        return null
    }
}

export function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.replace('login.html')
}

export function setIdentity() {
    const user = getUser()
    const name = document.querySelector('[data-user-name]')
    const role = document.querySelector('[data-user-role]')
    if (name) name.textContent = user.name || user.employee_id || 'User'
    if (role) role.textContent = user.role || ''
    document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', logout))
}
