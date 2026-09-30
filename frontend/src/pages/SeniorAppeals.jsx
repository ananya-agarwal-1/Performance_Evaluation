import { useEffect, useState } from 'react'
import './employeeDashboard.css'
import WorkDetailsModal from './WorkDetailsModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function SeniorAppeals() {
    const [appeals, setAppeals] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [resolvingId, setResolvingId] = useState(null)
    const [selectedAppeal, setSelectedAppeal] = useState(null)
    const [newCreditRating, setNewCreditRating] = useState('')
    const [resolutionNotes, setResolutionNotes] = useState('')

    useEffect(() => {
        loadAppeals()
    }, [])

    async function loadAppeals() {
        try {
            setLoading(true)
            setError('')

            const response = await fetch(`${API_URL}/appeals/pending`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
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
        return appeal.id ?? appeal.appeal_id
    }

    function getTaskId(appeal) {
        return appeal.task_id ?? appeal.work_id
    }

    function getEmployeeId(appeal) {
        return appeal.employee_id || '-'
    }

    function getEmployeeName(appeal) {
        return appeal.employee_name || appeal.name || appeal.employee_id || '-'
    }

    function getTaskTitle(appeal) {
        return appeal.task_title || appeal.title || 'Work'
    }

    function getCurrentCredit(appeal) {
        return appeal.current_credit_rating ?? appeal.credit_rating ?? '-'
    }

    function getReason(appeal) {
        return appeal.reason || 'No reason provided.'
    }

    function openAppeal(appeal) {
        setSelectedAppeal(appeal)
        setNewCreditRating('')
        setResolutionNotes('')
    }

    async function resolveAppeal(decision) {
        if (!selectedAppeal) return

        if (!resolutionNotes.trim()) {
            alert(decision === 'approved'
                ? 'Please enter resolution notes.'
                : 'Please enter a reason for rejecting the appeal.')
            return
        }

        if (decision === 'approved') {
            const rating = Number(newCreditRating)

            if (
                !Number.isInteger(rating) ||
                rating < 1 ||
                rating > 5
            ) {
                alert('New credit rating must be an integer from 1 to 5.')
                return
            }

            if (rating <= Number(getCurrentCredit(selectedAppeal))) {
                alert(`New credit rating must be greater than the current rating (${getCurrentCredit(selectedAppeal)}).`)
                return
            }
        }

        const appealId = getAppealId(selectedAppeal)
        setResolvingId(appealId)

        try {
            const body = {
                decision,
                resolution_notes: resolutionNotes.trim()
            }

            if (decision === 'approved') {
                body.new_credit_rating = Number(newCreditRating)
            }

            const response = await fetch(`${API_URL}/appeals/${appealId}/resolve`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(body)
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Failed to resolve appeal')
            }

            alert(decision === 'approved'
                ? 'Appeal approved successfully.'
                : 'Appeal rejected successfully.')

            setSelectedAppeal(null)
            await loadAppeals()
        } catch (err) {
            console.error(err)
            alert(err.message || 'Unable to resolve appeal')
        } finally {
            setResolvingId(null)
        }
    }

    if (loading) {
        return (
            <main className="employee-main">
                <div className="welcome-section">
                    <h1>Pending Appeals</h1>
                    <p>Loading appeals...</p>
                </div>
            </main>
        )
    }

    return (
        <main className="employee-main">
            <div className="welcome-section">
                <h1>Pending Appeals</h1>
                <p>Review the employee's submitted work before making the final appeal decision.</p>
            </div>

            {error && <p style={{ color: 'red', marginBottom: '20px' }}>{error}</p>}

            <div className="work-section table-container">
                {appeals.length === 0 ? (
                    <p>No pending appeals.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Appeal ID</th>
                                <th>Employee</th>
                                <th>Work</th>
                                <th>Current Credit</th>
                                <th>Reason</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {appeals.map((appeal) => (
                                <tr key={getAppealId(appeal)}>
                                    <td>{getAppealId(appeal)}</td>
                                    <td>
                                        <strong>{getEmployeeName(appeal)}</strong>
                                        <br />
                                        <small>{getEmployeeId(appeal)}</small>
                                    </td>
                                    <td>
                                        {getTaskTitle(appeal)}
                                        <br />
                                        <small>Work ID: {getTaskId(appeal)}</small>
                                    </td>
                                    <td>{getCurrentCredit(appeal)}/5</td>
                                    <td>{getReason(appeal)}</td>
                                    <td>
                                        <button className="text-button" onClick={() => openAppeal(appeal)}>
                                            View Work
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {selectedAppeal && (
                <WorkDetailsModal
                    work={{
                        id: getTaskId(selectedAppeal),
                        employee_id: selectedAppeal.employee_id,
                        employee_name: getEmployeeName(selectedAppeal),
                        title: selectedAppeal.task_title,
                        description: selectedAppeal.task_description,
                        submitted_work_title: selectedAppeal.submitted_work_title,
                        submitted_work_description: selectedAppeal.submitted_work_description,
                        submitted_work: selectedAppeal.submitted_work,
                        work_date: selectedAppeal.work_date,
                        work_time: selectedAppeal.work_time,
                        work_duration: selectedAppeal.work_duration,
                        work_submitted_at: selectedAppeal.work_submitted_at,
                        status: selectedAppeal.task_status,
                        credit_rating: selectedAppeal.current_credit_rating,
                        credits_earned: selectedAppeal.credits_earned
                    }}
                    onClose={() => setSelectedAppeal(null)}
                    showReviewActions={true}
                    processing={resolvingId === getAppealId(selectedAppeal)}
                    creditRating={newCreditRating}
                    reviewNotes={resolutionNotes}
                    onCreditChange={setNewCreditRating}
                    onNotesChange={setResolutionNotes}
                    onApprove={() => resolveAppeal('approved')}
                    onReject={() => resolveAppeal('rejected')}
                />
            )}
        </main>
    )
}

export default SeniorAppeals
