
import { useEffect, useState } from 'react'
import './employeeDashboard.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function EmployeeDashboard() {
    const [tasks, setTasks] = useState([])
    const [totalCredits, setTotalCredits] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const user = JSON.parse(localStorage.getItem('user') || '{}')

    async function loadTasks() {
        try {
            const token = localStorage.getItem('token')

            if (!token) {
                setError('You are not logged in.')
                setLoading(false)
                return
            }

            const response = await fetch(`${API_URL}/my-tasks`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Failed to load work')
            }

            const allTasks = [
                ...(data.assigned || []),
                ...(data.in_progress || []),
                ...(data.completed || []),
                ...(data.approved || []),
                ...(data.rejected || [])
            ]

            setTasks(allTasks)
            setTotalCredits(Number(data.totalCredits || 0))
        } catch (err) {
            setError(err.message || 'Unable to load your work')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadTasks()
    }, [])

    function getTaskId(task) {
        return task.id || task.task_id || ''
    }

    function getTaskTitle(task) {
        return task.task_title || task.title || task.task || 'Untitled Task'
    }

    function getStatus(task) {
        return task.status || 'assigned'
    }

    function getDate(task) {
        const date =
            task.due_date ||
            task.work_date ||
            task.assigned_at

        if (!date) return '-'

        return new Date(date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    function handleView(task) {
        alert(
            `Task: ${getTaskTitle(task)}\n` +
            `Status: ${getStatus(task)}\n` +
            `Description: ${task.description || 'No description available.'}`
        )
    }

    function handleAppeal(task) {
        window.location.href =
            `/employee/appeals?task=${getTaskId(task)}`
    }

    const completedWork = tasks.filter(
        task =>
            task.status === 'completed' ||
            task.status === 'approved' ||
            task.status === 'rejected'
    ).length

    const pendingReviews = tasks.filter(
        task => task.status === 'completed'
    ).length

    const recentTasks = tasks.slice(0, 5)

    if (loading) {
        return (
            <main className="employee-main">
                <p>Loading...</p>
            </main>
        )
    }

    return (
        <main className="employee-main">

            <div className="welcome-section">
                <h1>
                    Welcome back, {user.name || 'Employee'}
                </h1>

                <p>Your work overview</p>
            </div>

            {error && (
                <p className="login-error">
                    {error}
                </p>
            )}

            <div className="stats-container">

                <div className="stat-box">
                    <span>Total Work</span>
                    <strong>{tasks.length}</strong>
                </div>

                <div className="stat-box">
                    <span>Completed</span>
                    <strong>{completedWork}</strong>
                </div>

                <div className="stat-box">
                    <span>Total Points</span>
                    <strong>{totalCredits}</strong>
                </div>

                <div className="stat-box">
                    <span>Pending Reviews</span>
                    <strong>{pendingReviews}</strong>
                </div>

            </div>

            <div className="work-section">

                <div className="section-heading">
                    <h2>Recent Work</h2>

                    <button
                        className="primary-button"
                        onClick={() => {
                            window.location.href = '/employee/work'
                        }}
                    >
                        View All
                    </button>
                </div>

                {recentTasks.length === 0 ? (

                    <p className="empty-message">
                        No work assigned yet.
                    </p>

                ) : (

                    <table>

                        <thead>
                            <tr>
                                <th>Task</th>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>

                            {recentTasks.map(task => (

                                <tr key={getTaskId(task)}>

                                    <td>
                                        {getTaskTitle(task)}
                                    </td>

                                    <td>
                                        {getDate(task)}
                                    </td>

                                    <td>
                                        {getStatus(task)}
                                    </td>

                                    <td>

                                        {task.status === 'rejected' ? (

                                            <button
                                                className="text-button"
                                                onClick={() =>
                                                    handleAppeal(task)
                                                }
                                            >
                                                Appeal
                                            </button>

                                        ) : (

                                            <button
                                                className="text-button"
                                                onClick={() =>
                                                    handleView(task)
                                                }
                                            >
                                                View
                                            </button>

                                        )}

                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                )}

            </div>

        </main>
    )
}

export default EmployeeDashboard

