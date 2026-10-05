export const API_URL = 'http://localhost:3000'

export function getToken() {
    return localStorage.getItem('token') || ''
}

export function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user') || '{}')
    } catch {
        return {}
    }
}

export function setMessage(element, text, type = '') {
    if (!element) return
    element.textContent = text || ''
    element.className = `message ${type}`.trim()
}

export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character])
}

export async function apiRequest(path, options = {}) {
    const headers = { ...(options.headers || {}) }
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    let response
    try {
        response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body)
        })
    } catch {
        throw new Error('Cannot reach the EPMS backend at localhost:3000.')
    }

    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`)
    return data
}

export const apiGet = (path) => apiRequest(path)
export const apiPost = (path, body) => apiRequest(path, { method: 'POST', body })
export const apiPut = (path, body) => apiRequest(path, { method: 'PUT', body })
export const apiPatch = (path, body) => apiRequest(path, { method: 'PATCH', body })

export async function downloadFile(path, filename) {
    let response
    try {
        response = await fetch(`${API_URL}${path}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        })
    } catch {
        throw new Error('Cannot reach the EPMS backend at localhost:3000.')
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || `Download failed (${response.status})`)
    }
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
