function WorkDetailsModal({
    work,
    onClose,
    onApprove,
    onReject,
    processing = false,
    showReviewActions = false,
    reviewNotes = '',
    creditRating = '',
    onCreditChange,
    onNotesChange,
    canReview = true
}) {
    if (!work) return null

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

    async function downloadWork() {
        try {
            const response = await fetch(
                `${API_URL}/tasks/${work.id}/work/download`,
                {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('token')}`
                    }
                }
            )

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.message || 'Unable to download work')
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `work_${work.id}.xlsx`
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            alert(error.message || 'Unable to download work')
        }
    }

    const formatValue = (value) => {
        if (value === null || value === undefined || value === '') return '-'
        return value
    }

    return (
        <div className="work-modal-overlay" onMouseDown={onClose}>
            <div className="work-modal work-details-modal" onMouseDown={(event) => event.stopPropagation()}>
                <div className="work-modal-header">
                    <div>
                        <h2>Submitted Work</h2>
                        <p>Work ID: {work.id} · {work.employee_name || work.employee_id || 'Employee'}</p>
                    </div>
                    <button className="modal-close-button" onClick={onClose}>×</button>
                </div>

                <div className="work-details-grid">
                    <div><span>Employee</span><strong>{formatValue(work.employee_name || work.employee_id)}</strong></div>
                    <div><span>Assigned Work</span><strong>{formatValue(work.title)}</strong></div>
                    <div><span>Submitted Title</span><strong>{formatValue(work.submitted_work_title)}</strong></div>
                    <div><span>Work Date</span><strong>{formatValue(work.work_date)}</strong></div>
                    <div><span>Work Time</span><strong>{formatValue(work.work_time)}</strong></div>
                    <div><span>Duration</span><strong>{formatValue(work.work_duration)}</strong></div>
                    <div><span>Credit Rating</span><strong>{work.credit_rating !== null && work.credit_rating !== undefined ? `${work.credit_rating}/5` : 'Not rated'}</strong></div>
                    <div><span>Status</span><strong>{formatValue(work.status)}</strong></div>
                </div>

                <div className="work-detail-section">
                    <span>Assigned Description</span>
                    <p>{formatValue(work.description)}</p>
                </div>

                <div className="work-detail-section">
                    <span>Submitted Work Description</span>
                    <p>{formatValue(work.submitted_work_description)}</p>
                </div>

                <div className="work-detail-section">
                    <span>What the Employee Did</span>
                    <p className="submitted-work-text">{formatValue(work.submitted_work)}</p>
                </div>

                {showReviewActions && canReview && (
                    <div className="review-panel">
                        <h3>Review Work</h3>

                        <label>
                            Credit Rating (1-5)
                            <input
                                type="number"
                                min="1"
                                max="5"
                                value={creditRating}
                                onChange={(e) => onCreditChange(e.target.value)}
                                placeholder="1-5"
                            />
                        </label>

                        <label>
                            Review Notes
                            <textarea
                                value={reviewNotes}
                                onChange={(e) => onNotesChange(e.target.value)}
                                placeholder="Enter your review comments"
                                rows="3"
                            />
                        </label>
                    </div>
                )}

                <div className="modal-actions">
                    <button className="secondary-button" onClick={downloadWork}>
                        Download Excel
                    </button>

                    {showReviewActions && canReview && (
                        <>
                            <button
                                className="danger-button"
                                disabled={processing}
                                onClick={onReject}
                            >
                                {processing ? 'Processing...' : 'Reject'}
                            </button>

                            <button
                                className="primary-button"
                                disabled={processing}
                                onClick={onApprove}
                            >
                                {processing ? 'Processing...' : 'Approve & Give Credits'}
                            </button>
                        </>
                    )}

                    <button className="secondary-button" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default WorkDetailsModal
