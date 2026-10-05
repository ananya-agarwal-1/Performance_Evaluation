import { apiPost, setMessage } from './api.js'
import { pageForRole } from './auth.js'

const roleButtons = document.querySelectorAll('[data-role]')
const roleSelection = document.querySelector('#role-selection')
const loginForm = document.querySelector('#login-form')
const selectedRoleLabel = document.querySelector('#selected-role')
const message = document.querySelector('#page-message')
let selectedRole = ''

roleButtons.forEach((button) => button.addEventListener('click', () => {
    selectedRole = button.dataset.role
    selectedRoleLabel.textContent = button.textContent
    roleSelection.hidden = true
    loginForm.hidden = false
    document.querySelector('#email').focus()
}))

document.querySelector('#back-to-roles').addEventListener('click', () => {
    loginForm.reset()
    loginForm.hidden = true
    roleSelection.hidden = false
    setMessage(message, '')
})

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const submit = loginForm.querySelector('[type="submit"]')
    submit.disabled = true
    setMessage(message, 'Signing in…', 'info')
    try {
        const result = await apiPost('/api/auth/login', {
            role: selectedRole,
            email: loginForm.elements.email.value.trim(),
            password: loginForm.elements.password.value
        })
        if (!result.token || !result.user?.role || result.user.role !== selectedRole) {
            throw new Error('The account role does not match the selected role.')
        }
        localStorage.setItem('token', result.token)
        localStorage.setItem('user', JSON.stringify(result.user))
        window.location.replace(pageForRole(result.user.role))
    } catch (error) {
        setMessage(message, error.message, '')
        submit.disabled = false
    }
})
