import { useEffect, useState } from 'react'
import './assignWork.css'

const API_URL =
    import.meta.env.VITE_API_URL || 'http://localhost:3000'

function AssignWork() {
    const [employees, setEmployees] = useState([])
    const [employeeId, setEmployeeId] = useState('')
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        fetch(`${API_URL}/manager/employees`, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`
            }
        })
            .then(async response => {
                const data = await response.json()

                if (!response.ok) {
                    throw new Error(
                        data.message || 'Failed to load employees'
                    )
                }

                setEmployees(data.employees || [])
            })
            .catch(error => {
                alert(error.message)
            })
            .finally(() => {
                setLoading(false)
            })
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!employeeId || !title || !description || !dueDate) {
            alert('Please fill all fields')
            return
        }

        setSubmitting(true)

        try {
            const response = await fetch(`${API_URL}/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    employee_id: employeeId,
                    title,
                    description,
                    due_date: dueDate
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(
                    data.message || 'Failed to assign work'
                )
            }

            alert(`Work assigned successfully to ${employeeId}`)

            setEmployeeId('')
            setTitle('')
            setDescription('')
            setDueDate('')

        } catch (error) {
            alert(error.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main className="employee-main">
            <div className="assign-work-page">

                <h1>Assign Work</h1>

                <form
                    className="assign-work-form"
                    onSubmit={handleSubmit}
                >

                    <div className="form-group">
                        <label htmlFor="employee">
                            Select Employee
                        </label>

                        {loading ? (
                            <p>Loading employees...</p>
                        ) : (
                            <select
                                id="employee"
                                value={employeeId}
                                onChange={(e) =>
                                    setEmployeeId(e.target.value)
                                }
                            >
                                <option value="">
                                    -- Select Employee --
                                </option>

                                {employees.map(employee => (
                                    <option
                                        key={employee.employee_id}
                                        value={employee.employee_id}
                                    >
                                        {employee.employee_id} —{' '}
                                        {employee.job_title} —{' '}
                                        {employee.department}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="title">
                            Work Title
                        </label>

                        <input
                            id="title"
                            type="text"
                            value={title}
                            onChange={(e) =>
                                setTitle(e.target.value)
                            }
                            placeholder="Enter work title"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="description">
                            Description
                        </label>

                        <textarea
                            id="description"
                            value={description}
                            onChange={(e) =>
                                setDescription(e.target.value)
                            }
                            placeholder="Enter work description"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="dueDate">
                            Due Date
                        </label>

                        <input
                            id="dueDate"
                            type="date"
                            value={dueDate}
                            onChange={(e) =>
                                setDueDate(e.target.value)
                            }
                        />
                    </div>

                    <button
                        className="assign-work-button"
                        type="submit"
                        disabled={submitting}
                    >
                        {submitting
                            ? 'Assigning...'
                            : 'Assign Work'}
                    </button>

                </form>

            </div>
        </main>
    )
}

export default AssignWork