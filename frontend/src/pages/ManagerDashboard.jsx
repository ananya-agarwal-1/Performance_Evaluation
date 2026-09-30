import { useEffect, useState } from 'react'
import './managerDashboard.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function ManagerDashboard() {
    const [pendingReviews, setPendingReviews] = useState([])
    const [employeeWorkPending, setEmployeeWorkPending] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    async function loadPendingReviews() {
        try {
            setLoading(true)
            setError('')
            const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` }

            const [taskResponse, employeeResponse] = await Promise.all([
                fetch(`${API_URL}/team-tasks/pending-review`, { headers }),
                fetch(`${API_URL}/manager/employee-work`, { headers })
            ])

            const taskData = await taskResponse.json()
            const employeeData = await employeeResponse.json()

            if (!taskResponse.ok) throw new Error(taskData.message || 'Failed to load task reviews')
            if (!employeeResponse.ok) throw new Error(employeeData.message || 'Failed to load employee work')

            setPendingReviews(taskData.tasks || [])
            setEmployeeWorkPending((employeeData.work || []).filter((item) => item.status === 'pending'))
        } catch (err) {
            console.error(err)
            setError(err.message || 'Unable to load dashboard')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadPendingReviews() }, [])

    const totalPending = pendingReviews.length + employeeWorkPending.length

    return (
        <main className="manager-main">
            <div className="manager-header">
                <h1>Chief Manager Dashboard</h1>
                <p>Review employee work and manage your team's tasks.</p>
            </div>

            <div className="manager-summary">
                <div className="summary-card">
                    <span className="summary-label">Pending Reviews</span>
                    <strong>{totalPending}</strong>
                    <span className="summary-note">All work waiting for your attention</span>
                </div>
                <div className="summary-card">
                    <span className="summary-label">Independent Submissions</span>
                    <strong>{employeeWorkPending.length}</strong>
                    <span className="summary-note">Employee work awaiting approval</span>
                </div>
            </div>

            <section className="manager-section">
                <div className="manager-section-header">
                    <div>
                        <h2>Work Waiting for Review</h2>
                        <p>Open Team Work to see the complete submission, download Excel, and approve or reject it.</p>
                    </div>
                    <button className="refresh-button" onClick={loadPendingReviews}>Refresh</button>
                </div>

                {error && <div className="manager-error">{error}</div>}

                {loading ? (
                    <div className="empty-message">Loading reviews...</div>
                ) : totalPending === 0 ? (
                    <div className="empty-message">
                        <h3>No work to review</h3>
                        <p>New employee submissions will appear here.</p>
                    </div>
                ) : (
                    <div className="manager-table-wrapper">
                        <table className="manager-table">
                            <thead>
                                <tr><th>Type</th><th>Work ID</th><th>Employee</th><th>Title</th><th>Status</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                {employeeWorkPending.map((work) => (
                                    <tr key={`employee-${work.id}`}>
                                        <td>Employee Work</td>
                                        <td className="work-id">{work.id}</td>
                                        <td>{work.employee_name || work.employee_id}</td>
                                        <td className="task-name">{work.title}</td>
                                        <td><span className="status-badge">Pending</span></td>
                                        <td><button className="review-button" onClick={() => { window.location.href = '/manager/work' }}>Review</button></td>
                                    </tr>
                                ))}
                                {pendingReviews.map((work) => (
                                    <tr key={`task-${work.id}`}>
                                        <td>Assigned Task</td>
                                        <td className="work-id">{work.id}</td>
                                        <td>{work.employee_name || work.employee_id}</td>
                                        <td className="task-name">{work.submitted_work_title || work.title}</td>
                                        <td><span className="status-badge">Pending</span></td>
                                        <td><button className="review-button" onClick={() => { window.location.href = '/manager/work' }}>Review</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    )
}

export default ManagerDashboard
