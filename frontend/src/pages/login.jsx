```jsx
import './login.css'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const roles = [
    { key: 'employee', title: 'Employee' },
    { key: 'manager', title: 'Chief Manager' },
    { key: 'sm', title: 'Senior Authority' }
]

function Login() {
    const [selectedRole, setSelectedRole] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const navigate = useNavigate()

    async function handleLogin(e) {
        e.preventDefault()
        setError('')

        if (!selectedRole) {
            setError('Please select your position first.')
            return
        }

        setLoading(true)

        try {
            const response = await fetch('http://localhost:3000/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    password,
                    role: selectedRole
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Login failed')
            }

            localStorage.setItem('token', data.token)
            localStorage.setItem('user', JSON.stringify(data.user))

            if (data.user.role === 'employee') {
                navigate('/employee')
            } else if (data.user.role === 'manager') {
                navigate('/manager')
            } else if (data.user.role === 'sm') {
                navigate('/senior')
            } else {
                setError('Unknown user role')
            }

        } catch (err) {
            setError(err.message || 'Unable to connect to server')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="Login_Page">

            <div className="Login_left"></div>

            <div className="Login_right">
                <div className="Login_Box">

                    <h1>AKNEX</h1>
                    <p>Employee Performance Management System</p>

                    <form onSubmit={handleLogin}>

                        <label>Position</label>

                        <select
                            value={selectedRole}
                            onChange={(e) => {
                                setSelectedRole(e.target.value)
                                setError('')
                            }}
                            required
                        >
                            <option value="">Select position</option>

                            {roles.map((role) => (
                                <option
                                    key={role.key}
                                    value={role.key}
                                >
                                    {role.title}
                                </option>
                            ))}
                        </select>

                        <label>Email</label>

                        <input
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />

                        <label>Password</label>

                        <input
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />

                        {error && (
                            <p className="login-error">{error}</p>
                        )}

                        <button type="submit" disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>

                    </form>

                    <a href="#" onClick={(e) => e.preventDefault()}>
                        Forgot Password?
                    </a>

                </div>
            </div>

        </div>
    )
}

export default Login
```
