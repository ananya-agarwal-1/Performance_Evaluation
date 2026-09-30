import { useEffect, useState } from 'react'
import './employeeDashboard.css'
import WorkDetailsModal from './WorkDetailsModal'
import EmployeeSubmissionDetailsModal from './EmployeeSubmissionDetailsModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function ManagerWork() {
    const [teamTasks, setTeamTasks] = useState([])
    const [employeeWork, setEmployeeWork] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedTask, setSelectedTask] = useState(null)
    const [selectedEmployeeWork, setSelectedEmployeeWork] = useState(null)
    const [creditRating, setCreditRating] = useState('')
    const [reviewNotes, setReviewNotes] = useState('')
    const [employeeReviewNotes, setEmployeeReviewNotes] = useState('')
    const [processingId, setProcessingId] = useState(null)

    useEffect(() => { loadAll() }, [])

    async function loadAll() {
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
            if (!taskResponse.ok) throw new Error(taskData.message || 'Failed to load assigned work')
            if (!employeeResponse.ok) throw new Error(employeeData.message || 'Failed to load employee submissions')
            setTeamTasks(taskData.tasks || [])
            setEmployeeWork(employeeData.work || [])
        } catch (err) {
            console.error(err)
            setError(err.message || 'Unable to load team work')
        } finally {
            setLoading(false)
        }
    }

    function openTask(task) {
        setSelectedTask(task)
        setCreditRating(task.credit_rating ?? '')
        setReviewNotes(task.review_notes || '')
    }

    function openEmployeeWork(work) {
        setSelectedEmployeeWork(work)
        setEmployeeReviewNotes(work.review_notes || '')
    }

    async function reviewTask(decision) {
        if (!selectedTask) return
        if (!reviewNotes.trim()) return alert('Please enter manager review notes.')
        if (decision === 'approved' && (!Number.isInteger(Number(creditRating)) || Number(creditRating) < 1 || Number(creditRating) > 5)) {
            return alert('Please enter a credit rating between 1 and 5.')
        }

        const id = selectedTask.id
        setProcessingId(`task-${id}`)
        try {
            const body = {
                decision,
                review_notes: reviewNotes.trim(),
                quality_rating: decision === 'approved' ? 'satisfactory' : 'unsatisfactory'
            }
            if (decision === 'approved') body.credit_rating = Number(creditRating)

            const response = await fetch(`${API_URL}/tasks/${id}/review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify(body)
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.message || 'Failed to review task')
            alert(decision === 'approved' ? `Task approved. Credits earned: ${data.credits_earned}` : 'Task rejected.')
            setSelectedTask(null)
            await loadAll()
        } catch (err) {
            alert(err.message || 'Unable to review task')
        } finally {
            setProcessingId(null)
        }
    }

    async function reviewEmployeeWork(decision) {
        if (!selectedEmployeeWork) return
        if (!employeeReviewNotes.trim()) return alert('Please enter review notes.')

        const id = selectedEmployeeWork.id
        setProcessingId(`employee-${id}`)
        try {
            const response = await fetch(`${API_URL}/manager/employee-work/${id}/review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ decision, review_notes: employeeReviewNotes.trim() })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.message || 'Failed to review employee work')
            alert(decision === 'approved' ? `Work approved. Credits earned: ${Number(data.creditsEarned).toFixed(2)}/5` : 'Work rejected.')
            setSelectedEmployeeWork(null)
            await loadAll()
        } catch (err) {
            alert(err.message || 'Unable to review employee work')
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) return <main className="employee-main"><div className="page-heading"><h1>Team Work</h1><p>Loading team submissions...</p></div></main>

    return (
        <main className="employee-main">
            <div className="page-heading">
                <h1>Team Work</h1>
                <p>View the complete work submitted by employees, download it, and review it.</p>
            </div>

            <div className="work-toolbar">
                <button className="secondary-button" onClick={loadAll}>Refresh</button>
            </div>

            {error && <div className="dashboard-error">{error}</div>}

            <div className="work-section table-container">
                <div className="section-heading">
                    <h2>Employee-Submitted Work</h2>
                    <p>Independent submissions stored in employee work history.</p>
                </div>

                {employeeWork.length === 0 ? <div className="empty-message"><p>No employee-submitted work found.</p></div> : (
                    <table>
                        <thead>
                            <tr><th>Work ID</th><th>Employee</th><th>Title</th><th>Work Date</th><th>Status</th><th>Credits</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            {employeeWork.map((work) => (
                                <tr key={work.id}>
                                    <td>{work.id}</td>
                                    <td><strong>{work.employee_name}</strong><br /><small>{work.employee_id}</small></td>
                                    <td>{work.title}</td>
                                    <td>{work.work_date ? new Date(work.work_date).toLocaleDateString('en-GB') : '-'}</td>
                                    <td><span className={`status ${work.status}`}>{work.status}</span></td>
                                    <td>{Number(work.credits_earned || 0).toFixed(2)}/5</td>
                                    <td className="action-buttons">
                                        <button onClick={() => openEmployeeWork(work)}>View & Review</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="work-section table-container" style={{ marginTop: '25px' }}>
                <div className="section-heading">
                    <h2>Assigned Task Submissions</h2>
                    <p>Tasks completed through the manager's assigned-work workflow.</p>
                </div>

                {teamTasks.length === 0 ? <div className="empty-message"><p>No assigned task submissions are waiting for review.</p></div> : (
                    <table>
                        <thead>
                            <tr><th>Work ID</th><th>Employee</th><th>Task</th><th>Submitted Date</th><th>Status</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            {teamTasks.map((work) => (
                                <tr key={work.id}>
                                    <td>{work.id}</td>
                                    <td>{work.employee_name || work.employee_id}</td>
                                    <td>{work.submitted_work_title || work.title}</td>
                                    <td>{work.work_date ? new Date(work.work_date).toLocaleDateString('en-GB') : '-'}</td>
                                    <td>{work.status}</td>
                                    <td className="action-buttons">
                                        <button onClick={() => openTask(work)}>View & Review</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <WorkDetailsModal
                work={selectedTask}
                onClose={() => setSelectedTask(null)}
                showReviewActions={true}
                processing={processingId === `task-${selectedTask?.id}`}
                creditRating={creditRating}
                reviewNotes={reviewNotes}
                onCreditChange={setCreditRating}
                onNotesChange={setReviewNotes}
                onApprove={() => reviewTask('approved')}
                onReject={() => reviewTask('rejected')}
            />

            <EmployeeSubmissionDetailsModal
                work={selectedEmployeeWork}
                onClose={() => setSelectedEmployeeWork(null)}
                canReview={true}
                reviewNotes={employeeReviewNotes}
                onReviewNotesChange={setEmployeeReviewNotes}
                onApprove={() => reviewEmployeeWork('approved')}
                onReject={() => reviewEmployeeWork('rejected')}
                processing={processingId === `employee-${selectedEmployeeWork?.id}`}
                downloadBase="/manager/employee-work"
            />
        </main>
    )
}

export default ManagerWork
