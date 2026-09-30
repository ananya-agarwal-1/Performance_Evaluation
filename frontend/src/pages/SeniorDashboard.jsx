import { useEffect, useState } from 'react'
import './employeeDashboard.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function SeniorDashboard() {
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0
    })

    const [appeals, setAppeals] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        loadDashboard()
    }, [])

    async function loadDashboard() {
        try {
            setLoading(true)
            setError('')

            const token = localStorage.getItem('token')

            const headers = {
                Authorization: `Bearer ${token}`
            }

            const statsResponse = await fetch(
                `${API_URL}/appeals/stats`,
                { headers }
            )

            const statsData = await statsResponse.json()

            if (!statsResponse.ok) {
                throw new Error(
                    statsData.message || 'Failed to load statistics'
                )
            }

            setStats(statsData)

            const appealsResponse = await fetch(
                `${API_URL}/appeals/pending`,
                { headers }
            )

            const appealsData = await appealsResponse.json()

            if (!appealsResponse.ok) {
                throw new Error(
                    appealsData.message || 'Failed to load appeals'
                )
            }

            setAppeals(appealsData.appeals || [])

        } catch (err) {
            console.error(err)
            setError(err.message || 'Unable to load dashboard')
        } finally {
            setLoading(false)
        }
    }

    function getAppealId(appeal) {
        return appeal.id ?? appeal.appeal_id
    }

    function getTaskId(appeal) {
        return appeal.task_id ?? appeal.work_id
    }

    function getEmployeeName(appeal) {
        return (
            appeal.employee_name ||
            appeal.name ||
            appeal.employee_id ||
            '-'
        )
    }

    function getReason(appeal) {
        return appeal.reason || 'No reason provided.'
    }

    function getDate(appeal) {
        const date = appeal.created_at || appeal.appeal_date

        if (!date) return '-'

        return new Date(date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    if (loading) {
        return (
            <main className="employee-main">
                <div className="welcome-section">
                    <h1>Senior Dashboard</h1>
                    <p>Loading your appeal dashboard...</p>
                </div>
            </main>
        )
    }

    return (
        <main className="employee-main">

            <div className="welcome-section">
                <h1>Senior Dashboard</h1>
                <p>
                    Review employee appeals and make final decisions.
                </p>
            </div>

            {error && (
                <div className="dashboard-error">
                    {error}
                </div>
            )}

            <div className="senior-stats">

                <div className="senior-stat-card">
                    <span className="senior-stat-label">
                        Total Appeals
                    </span>

                    <strong className="senior-stat-value">
                        {stats.total}
                    </strong>
                </div>

                <div className="senior-stat-card">
                    <span className="senior-stat-label">
                        Pending Appeals
                    </span>

                    <strong className="senior-stat-value">
                        {stats.pending}
                    </strong>
                </div>

                <div className="senior-stat-card">
                    <span className="senior-stat-label">
                        Approved Appeals
                    </span>

                    <strong className="senior-stat-value">
                        {stats.approved}
                    </strong>
                </div>

                <div className="senior-stat-card">
                    <span className="senior-stat-label">
                        Rejected Appeals
                    </span>

                    <strong className="senior-stat-value">
                        {stats.rejected}
                    </strong>
                </div>

            </div>

            <div className="senior-appeals-card">

                <div className="senior-section-header">

                    <div>
                        <h2>Pending Appeals</h2>

                        <p>
                            Appeals waiting for your final decision.
                        </p>
                    </div>

                    <span className="pending-count">
                        {stats.pending} pending
                    </span>

                </div>

                {appeals.length === 0 ? (

                    <div className="empty-appeals">

                        <div className="empty-icon">
                            ✓
                        </div>

                        <h3>No pending appeals</h3>

                        <p>
                            There are currently no employee appeals
                            waiting for review.
                        </p>

                    </div>

                ) : (

                    <div className="appeals-list">

                        {appeals.map((appeal) => (

                            <div
                                className="appeal-item"
                                key={getAppealId(appeal)}
                            >

                                <div className="appeal-top">

                                    <span className="appeal-id">
                                        Appeal #{getAppealId(appeal)}
                                    </span>

                                    <span className="status pending">
                                        Pending
                                    </span>

                                </div>

                                <h3>
                                    Work ID: {getTaskId(appeal)}
                                </h3>

                                <div className="appeal-details">

                                    <div>
                                        <span className="detail-label">
                                            Employee
                                        </span>

                                        <strong>
                                            {getEmployeeName(appeal)}
                                        </strong>
                                    </div>

                                    <div>
                                        <span className="detail-label">
                                            Appeal Date
                                        </span>

                                        <strong>
                                            {getDate(appeal)}
                                        </strong>
                                    </div>

                                </div>

                                <div className="appeal-reason">

                                    <span className="detail-label">
                                        Reason
                                    </span>

                                    <p>
                                        {getReason(appeal)}
                                    </p>

                                </div>

                            </div>

                        ))}

                    </div>

                )}

            </div>

        </main>
    )
}

export default SeniorDashboard