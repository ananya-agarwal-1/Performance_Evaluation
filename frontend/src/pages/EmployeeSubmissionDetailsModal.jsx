const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function EmployeeSubmissionDetailsModal({
    work,
    onClose,
    canReview = false,
    reviewNotes = '',
    onReviewNotesChange,
    onApprove,
    onReject,
    processing = false,
    downloadBase = '/employee-work'
}) {
    if (!work) return null

    async function downloadWork() {
        try {
            const response = await fetch(
                `${API_URL}${downloadBase}/${work.id}/download`,
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            )

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.message || 'Unable to download work')
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `employee_work_${work.id}.xlsx`
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            window.URL.revokeObjectURL(url)
        } catch (err) {
            alert(err.message || 'Unable to download work')
        }
    }

    return (
        <div className="work-modal-overlay" onMouseDown={onClose}>
            <div className="work-modal work-details-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="work-modal-header">
                    <div>
                        <h2>Submitted Work</h2>
                        <p>Work ID: {work.id} · {work.employee_name || work.employee_id}</p>
                    </div>
                    <button className="modal-close-button" onClick={onClose}>×</button>
                </div>

                <div className="work-details-grid">
                    <div><span>Employee</span><strong>{work.employee_name || work.employee_id}</strong></div>
                    <div><span>Work Title</span><strong>{work.title}</strong></div>
                    <div><span>Work Date</span><strong>{work.work_date || '-'}</strong></div>
                    <div><span>Hours Spent</span><strong>{work.hours_spent ?? '-'}</strong></div>
                    <div><span>Status</span><strong>{work.status}</strong></div>
                    <div><span>Credits Earned</span><strong>{Number(work.credits_earned || 0).toFixed(2)}/5</strong></div>
                    <div><span>Reviewed By</span><strong>{work.reviewed_by || '-'}</strong></div>
                    <div><span>Reviewed At</span><strong>{work.reviewed_at || '-'}</strong></div>
                </div>

                <div className="work-detail-section">
                    <span>Description</span>
                    <p className="submitted-work-text">{work.description}</p>
                </div>

                {work.review_notes && (
                    <div className="work-detail-section">
                        <span>Review Notes</span>
                        <p>{work.review_notes}</p>
                    </div>
                )}

                {canReview && work.status === 'pending' && (
                    <div className="review-panel">
                        <h3>Manager Review</h3>
                        <label>
                            Review Notes
                            <textarea
                                rows="4"
                                value={reviewNotes}
                                onChange={(e) => onReviewNotesChange(e.target.value)}
                                placeholder="Enter your review comments"
                            />
                        </label>
                    </div>
                )}

                <div className="modal-actions">
                    <button className="secondary-button" onClick={downloadWork}>Download Excel</button>

                    {canReview && work.status === 'pending' && (
                        <>
                            <button className="danger-button" disabled={processing} onClick={onReject}>
                                {processing ? 'Processing...' : 'Reject'}
                            </button>
                            <button className="primary-button" disabled={processing} onClick={onApprove}>
                                {processing ? 'Processing...' : 'Approve & Give Credits'}
                            </button>
                        </>
                    )}

                    <button className="secondary-button" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    )
}

export default EmployeeSubmissionDetailsModal
