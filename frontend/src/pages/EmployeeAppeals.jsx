import { useEffect, useState } from 'react'
import './employeeDashboard.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function EmployeeAppeals() {
    const [appeals, setAppeals] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        loadAppeals()
    }, [])

    async function loadAppeals() {
        try {
            setLoading(true)
            setError('')

            const token = localStorage.getItem('token')

            if (!token) {
                setError('You are not logged in.')
                return
            }

            const response = await fetch(`${API_URL}/my-appeals`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Failed to load appeals')
            }

            setAppeals(data.appeals || [])
        } catch (err) {
            console.error(err)
            setError(err.message || 'Unable to load appeals')
        } finally {
            setLoading(false)
        }
    }

    function getAppealId(appeal) {
        return appeal.id ?? appeal.appeal_id ?? '-'
    }

    function getTaskId(appeal) {
        return appeal.task_id ?? appeal.work_id ?? '-'
    }

    function getTaskTitle(appeal) {
        return appeal.task_title || appeal.title || appeal.task || 'Work'
    }

    function getCurrentCredit(appeal) {
        const rating =
            appeal.current_credit_rating ??
            appeal.credit_rating ??
            appeal.manager_credit_rating

        return rating !== null && rating !== undefined
            ? `${rating}/5`
            : '-'
    }

    function getRequestedCredit(appeal) {
        const rating =
            appeal.new_credit_rating ??
            appeal.requested_credit_rating ??
            appeal.requested_score

        return rating !== null && rating !== undefined
            ? `${rating}/5`
            : '-'
    }

    function getStatus(appeal) {
        return appeal.status || 'pending'
    }

    function getStatusText(status) {
        return status
            .replace('_', ' ')
            .replace(/\b\w/g, letter => letter.toUpperCase())
    }

    function getReason(appeal) {
        return appeal.reason || appeal.appeal_reason || '-'
    }

    function getSeniorComment(appeal) {
        return (
            appeal.senior_comment ||
            appeal.resolution_reason ||
            appeal.decision_reason ||
            '-'
        )
    }

    function getDecisionDate(appeal) {
        const date =
            appeal.resolved_at ||
            appeal.decision_date ||
            appeal.updated_at

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
                    <h1>My Appeals</h1>
                    <p>Loading your appeals...</p>
                </div>
            </main>
        )
    }

    return (
        <main className="employee-main">

            <div className="welcome-section">
                <h1>My Appeals</h1>
                <p>Review your appeals and their final decisions.</p>
            </div>

            {error && (
                <p style={{ color: 'red', marginBottom: '20px' }}>
                    {error}
                </p>
            )}

            <div className="work-section table-container">

                <div className="section-heading">
                    <h2>Appeal History</h2>
                </div>

                {appeals.length === 0 ? (

                    <p>No appeals submitted.</p>

                ) : (

                    <table>

                        <thead>
                            <tr>
                                <th>Appeal ID</th>
                                <th>Work ID</th>
                                <th>Task</th>
                                <th>Current Credit</th>
                                <th>Requested Credit</th>
                                <th>Reason</th>
                                <th>Status</th>
                                <th>Senior Comment</th>
                                <th>Decision Date</th>
                            </tr>
                        </thead>

                        <tbody>

                            {appeals.map((appeal) => (

                                <tr key={getAppealId(appeal)}>

                                    <td>{getAppealId(appeal)}</td>

                                    <td>{getTaskId(appeal)}</td>

                                    <td>{getTaskTitle(appeal)}</td>

                                    <td>{getCurrentCredit(appeal)}</td>

                                    <td>{getRequestedCredit(appeal)}</td>

                                    <td>{getReason(appeal)}</td>

                                    <td>
                                        <span className={`status ${getStatus(appeal)}`}>
                                            {getStatusText(getStatus(appeal))}
                                        </span>
                                    </td>

                                    <td>{getSeniorComment(appeal)}</td>

                                    <td>{getDecisionDate(appeal)}</td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                )}

            </div>

        </main>
    )
}

export default EmployeeAppeals