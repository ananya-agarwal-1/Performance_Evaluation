import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function SubmitIndependentWorkModal({ onClose, onSubmitted }) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10))
    const [hours, setHours] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')

        if (!title.trim() || !description.trim() || !workDate) {
            setError('Title, description and work date are required.')
            return
        }

        try {
            setSubmitting(true)
            const response = await fetch(`${API_URL}/employee-work`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    work_date: workDate,
                    hours_spent: hours === '' ? null : Number(hours)
                })
            })

            const data = await response.json()
            if (!response.ok) throw new Error(data.message || 'Failed to submit work')

            alert('Work submitted successfully.')
            await onSubmitted()
            onClose()
        } catch (err) {
            setError(err.message || 'Unable to submit work')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="work-modal-overlay" onMouseDown={onClose}>
            <div className="work-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="work-modal-header">
                    <div>
                        <h2>Add My Work</h2>
                        <p>Submit work that you completed independently.</p>
                    </div>
                    <button className="modal-close-button" onClick={onClose}>×</button>
                </div>

                {error && <div className="modal-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="modal-form-grid">
                        <label>
                            Work Title
                            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter work title" />
                        </label>

                        <label>
                            Work Date
                            <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
                        </label>
                    </div>

                    <label>
                        Description
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the work you completed" rows="5" />
                    </label>

                    <label>
                        Hours Spent (optional)
                        <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g. 3.5" />
                    </label>

                    <div className="modal-actions">
                        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="primary-button" disabled={submitting}>
                            {submitting ? 'Submitting...' : 'Submit Work'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default SubmitIndependentWorkModal
