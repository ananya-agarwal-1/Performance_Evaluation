import { useEffect, useState } from 'react'
import './employeeDashboard.css'
import EmployeeSubmissionDetailsModal from './EmployeeSubmissionDetailsModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function SeniorWork() {
    const [work, setWork] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedWork, setSelectedWork] = useState(null)

    async function loadWork() {
        try {
            setLoading(true)
            setError('')
            const response = await fetch(`${API_URL}/senior/employee-work`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.message || 'Failed to load employee work')
            setWork(data.work || [])
        } catch (err) {
            setError(err.message || 'Unable to load employee work')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadWork() }, [])

    if (loading) return <main className="employee-main"><div className="welcome-section"><h1>Employee Work</h1><p>Loading submissions...</p></div></main>

    return (
        <main className="employee-main">
            <div className="page-heading">
                <h1>Employee Work</h1>
                <p>View submitted employee work and download the complete Excel record.</p>
            </div>

            <div className="work-toolbar">
                <button className="secondary-button" onClick={loadWork}>Refresh</button>
            </div>

            {error && <div className="dashboard-error">{error}</div>}

            <div className="work-section table-container">
                {work.length === 0 ? <div className="empty-message"><p>No employee work found.</p></div> : (
                    <table>
                        <thead>
                            <tr><th>Work ID</th><th>Employee</th><th>Title</th><th>Date</th><th>Status</th><th>Credits</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            {work.map((item) => (
                                <tr key={item.id}>
                                    <td>{item.id}</td>
                                    <td>{item.employee_name}<br /><small>{item.employee_id}</small></td>
                                    <td>{item.title}</td>
                                    <td>{item.work_date ? new Date(item.work_date).toLocaleDateString('en-GB') : '-'}</td>
                                    <td>{item.status}</td>
                                    <td>{Number(item.credits_earned || 0).toFixed(2)}/5</td>
                                    <td className="action-buttons"><button onClick={() => setSelectedWork(item)}>View & Download</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <EmployeeSubmissionDetailsModal
                work={selectedWork}
                onClose={() => setSelectedWork(null)}
                downloadBase="/senior/employee-work"
            />
        </main>
    )
}

export default SeniorWork
