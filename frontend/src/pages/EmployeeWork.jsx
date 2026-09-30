import { useEffect, useState } from 'react'
import './employeeDashboard.css'
import SubmitWorkModal from './SubmitWorkModal'
import SubmitIndependentWorkModal from './SubmitIndependentWorkModal'
import EmployeeSubmissionDetailsModal from './EmployeeSubmissionDetailsModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function EmployeeWork() {
    const [tasks, setTasks] = useState([])
    const [submittedWork, setSubmittedWork] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [updatingId, setUpdatingId] = useState(null)
    const [appealingId, setAppealingId] = useState(null)
    const [submitTask, setSubmitTask] = useState(null)
    const [showAddWork, setShowAddWork] = useState(false)
    const [selectedSubmission, setSelectedSubmission] = useState(null)

    useEffect(() => {
        loadAllWork()
    }, [])

    async function loadAllWork() {
        try {
            setLoading(true)
            setError('')
            const token = localStorage.getItem('token')
            const headers = { Authorization: `Bearer ${token}` }

            const [tasksResponse, submittedResponse] = await Promise.all([
                fetch(`${API_URL}/my-tasks`, { headers }),
                fetch(`${API_URL}/employee-work/my`, { headers })
            ])

            const tasksData = await tasksResponse.json()
            const submittedData = await submittedResponse.json()

            if (!tasksResponse.ok) throw new Error(tasksData.message || 'Failed to load assigned work')
            if (!submittedResponse.ok) throw new Error(submittedData.message || 'Failed to load submitted work')

            const taskData = tasksData.tasks || {}
            setTasks([
                ...(taskData.assigned || []),
                ...(taskData.in_progress || []),
                ...(taskData.completed || []),
                ...(taskData.approved || []),
                ...(taskData.rejected || [])
            ])
            setSubmittedWork(submittedData.work || [])
        } catch (err) {
            console.error(err)
            setError(err.message || 'Unable to load work')
        } finally {
            setLoading(false)
        }
    }

    function getTaskId(task) {
        return task.id ?? task.task_id
    }

    function displayStatus(status) {
        return String(status || '')
            .replaceAll('_', ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase())
    }

    function getDate(value) {
        if (!value) return '-'
        return new Date(value).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        })
    }

    async function updateStatus(task, newStatus) {
        try {
            setUpdatingId(getTaskId(task))
            const response = await fetch(`${API_URL}/tasks/${getTaskId(task)}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ status: newStatus })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.message || 'Failed to update task')
            await loadAllWork()
        } catch (err) {
            alert(err.message || 'Unable to update task')
        } finally {
            setUpdatingId(null)
        }
    }

    async function handleAppeal(task) {
        const reason = window.prompt('Why are you appealing this credit rating?')
        if (!reason?.trim()) return

        try {
            setAppealingId(getTaskId(task))
            const response = await fetch(`${API_URL}/appeals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ task_id: getTaskId(task), reason: reason.trim() })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.message || 'Failed to submit appeal')
            alert('Appeal submitted successfully.')
            await loadAllWork()
        } catch (err) {
            alert(err.message || 'Unable to submit appeal')
        } finally {
            setAppealingId(null)
        }
    }

    async function downloadTask(task) {
        try {
            const response = await fetch(`${API_URL}/tasks/${getTaskId(task)}/work/download`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            })
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.message || 'Unable to download work')
            }
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `work_${getTaskId(task)}.xlsx`
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            alert(err.message || 'Unable to download work')
        }
    }


    async function downloadSubmittedWork(work) {
        try {
            const response = await fetch(`${API_URL}/employee-work/${work.id}/download`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            })
            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.message || 'Unable to download work')
            }
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `employee_work_${work.id}.xlsx`
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            URL.revokeObjectURL(url)
        } catch (err) {
            alert(err.message || 'Unable to download work')
        }
    }

    if (loading) {
        return <main className="employee-main"><div className="welcome-section"><h1>My Work</h1><p>Loading all your work...</p></div></main>
    }

    return (
        <main className="employee-main">
            <div className="page-heading">
                <h1>My Work</h1>
                <p>All assigned work and all work you have submitted, past and current.</p>
            </div>

            <div className="work-toolbar">
                <button className="primary-button" onClick={() => setShowAddWork(true)}>+ Add My Work</button>
                <button className="secondary-button" onClick={loadAllWork}>Refresh</button>
            </div>

            {error && <div className="dashboard-error">{error}</div>}

            <div className="work-section table-container">
                <div className="section-heading">
                    <h2>Assigned Work</h2>
                </div>

                {tasks.length === 0 ? <div className="empty-message"><p>No assigned work yet.</p></div> : (
                    <table>
                        <thead>
                            <tr>
                                <th>Work ID</th><th>Task</th><th>Due Date</th><th>Status</th><th>Credits</th><th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((task) => {
                                const id = getTaskId(task)
                                const status = task.status
                                return (
                                    <tr key={`task-${id}`}>
                                        <td>{id}</td>
                                        <td>{task.title || 'Untitled Task'}</td>
                                        <td>{getDate(task.due_date)}</td>
                                        <td><span className={`status ${status}`}>{displayStatus(status)}</span></td>
                                        <td>{status === 'approved' ? `${Number(task.credits_earned || 0).toFixed(2)}` : '-'}</td>
                                        <td className="action-buttons">
                                            {status === 'assigned' && (
                                                <button disabled={updatingId === id} onClick={() => updateStatus(task, 'in_progress')}>
                                                    {updatingId === id ? 'Updating...' : 'Start Work'}
                                                </button>
                                            )}
                                            {status === 'in_progress' && <button onClick={() => setSubmitTask(task)}>Submit My Work</button>}
                                            {['completed', 'approved', 'rejected'].includes(status) && task.submitted_work && (
                                                <button onClick={() => downloadTask(task)}>Download Excel</button>
                                            )}
                                            {status === 'approved' && task.credit_rating !== null && Number(task.credit_rating) < 4 && (
                                                <button disabled={appealingId === id} onClick={() => handleAppeal(task)}>
                                                    {appealingId === id ? 'Submitting...' : 'Appeal'}
                                                </button>
                                            )}
                                            {status === 'completed' && <span>Waiting for Manager</span>}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="work-section table-container" style={{ marginTop: '25px' }}>
                <div className="section-heading">
                    <h2>My Submitted Work</h2>
                    <p>Previous and current independent submissions are kept here.</p>
                </div>

                {submittedWork.length === 0 ? <div className="empty-message"><p>You have not submitted independent work yet.</p></div> : (
                    <table>
                        <thead>
                            <tr>
                                <th>Work ID</th><th>Title</th><th>Work Date</th><th>Hours</th><th>Status</th><th>Credits</th><th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {submittedWork.map((work) => (
                                <tr key={`submitted-${work.id}`}>
                                    <td>{work.id}</td>
                                    <td>{work.title}</td>
                                    <td>{getDate(work.work_date)}</td>
                                    <td>{work.hours_spent ?? '-'}</td>
                                    <td><span className={`status ${work.status}`}>{displayStatus(work.status)}</span></td>
                                    <td>{Number(work.credits_earned || 0).toFixed(2)}/5</td>
                                    <td className="action-buttons">
                                        <button onClick={() => setSelectedSubmission(work)}>View</button>
                                        <button onClick={() => downloadSubmittedWork(work)}>Download Excel</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {submitTask && (
                <SubmitWorkModal task={submitTask} onClose={() => setSubmitTask(null)} onSubmitted={loadAllWork} />
            )}

            {showAddWork && (
                <SubmitIndependentWorkModal onClose={() => setShowAddWork(false)} onSubmitted={loadAllWork} />
            )}

            {selectedSubmission && (
                <EmployeeSubmissionDetailsModal
                    work={selectedSubmission}
                    onClose={() => setSelectedSubmission(null)}
                    downloadBase="/employee-work"
                />
            )}
        </main>
    )
}

export default EmployeeWork
