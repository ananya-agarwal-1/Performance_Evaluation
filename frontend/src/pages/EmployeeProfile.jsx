import { useNavigate } from 'react-router-dom'
import './employeeDashboard.css'

function EmployeeProfile() {
    const navigate = useNavigate()

    return (
        <main className="employee-main">
            <div className="page-heading">
                <h1>My Profile</h1>
                <p>View your employee information.</p>
            </div>

            <div className="profile-section">
                <div className="profile-details">
                    <div><span>Name</span><strong>Ananya Agarwal</strong></div>
                    <div><span>Email</span><strong>ananya@example.com</strong></div>
                    <div><span>Employee ID</span><strong>EMP001</strong></div>
                    <div><span>Department</span><strong>Computer Science</strong></div>
                    <div><span>Designation</span><strong>Software Engineer</strong></div>
                    <div><span>Role</span><strong>Employee</strong></div>
                </div>

                <button className="view-button" onClick={() => navigate('/')}>Logout</button>
            </div>
        </main>
    )
}

export default EmployeeProfile