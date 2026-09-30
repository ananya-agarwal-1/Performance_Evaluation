import { useState } from 'react'

function SubmitWorkModal({ task, onClose, onSubmitted }) {
    const [workTitle, setWorkTitle] = useState(task?.submitted_work_title || task?.title || '')
    const [description, setDescription] = useState(task?.submitted_work_description || '')
    const [work, setWork] = useState(task?.submitted_work || '')
    const [workDate, setWorkDate] = useState(task?.work_date ? String(task.work_date).slice(0, 10) : new Date().toISOString().slice(0, 10))
    const [workTime, setWorkTime] = useState(task?.work_time ? String(task.work_time).slice(0, 5) : new Date().toTimeString().slice(0, 5))
    const [duration, setDuration] = useState(task?.work_duration || '')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

    async function handleSubmit(event) {
        event.preventDefault()
        setError('')

        if (!workTitle.trim() || !description.trim() || !work.trim() ||
            !workDate || !workTime || !duration.trim()) {
            setError('Please fill all work submission fields.')
            return
        }

        try {
            setSubmitting(true)

            const response = await fetch(
                `${API_URL}/tasks/${task.id}/submit-work`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        work_title: workTitle.trim(),
                        work_description: description.trim(),
                        work: work.trim(),
                        work_date: workDate,
                        work_time: workTime,
                        work_duration: duration.trim()
                    })
                }
            )

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Failed to submit work')
            }

            alert('Your work has been submitted to the Chief Manager.')
            onSubmitted()
            onClose()
        } catch (err) {
            setError(err.message || 'Unable to submit work')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="work-modal-overlay" onMouseDown={onClose}>
            <div className="work-modal" onMouseDown={(event) => event.stopPropagation()}>
                <div className="work-modal-header">
                    <div>
                        <h2>Submit My Work</h2>
                        <p>Work ID: {task.id} · {task.title}</p>
                    </div>
                    <button className="modal-close-button" onClick={onClose}>×</button>
                </div>

                {error && <div className="modal-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="modal-form-grid">
                        <label>
                            Work Title
                            <input value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} />
                        </label>

                        <label>
                            Work Date
                            <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
                        </label>

                        <label>
                            Work Time
                            <input type="time" value={workTime} onChange={(e) => setWorkTime(e.target.value)} />
                        </label>

                        <label>
                            Duration
                            <input placeholder="e.g. 3 hours" value={duration} onChange={(e) => setDuration(e.target.value)} />
                        </label>
                    </div>

                    <label className="modal-full-label">
                        Work Description
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows="3" />
                    </label>

                    <label className="modal-full-label">
                        What I Did
                        <textarea
                            value={work}
                            onChange={(e) => setWork(e.target.value)}
                            rows="6"
                            placeholder="Describe the actual work you completed..."
                        />
                    </label>

                    <div className="modal-actions">
                        <button type="button" className="secondary-button" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="primary-button" disabled={submitting}>
                            {submitting ? 'Submitting...' : 'Submit Work'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default SubmitWorkModal
