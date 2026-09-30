import { useNavigate } from 'react-router-dom'
import './employeeDashboard.css'

function RoleProfile({ profile }) {
    const navigate = useNavigate()

    return (
        <main className="employee-main">
            <div className="page-heading">
                <h1>My Profile</h1>
                <p>View your profile information.</p>
            </div>
            <div className="profile-section">
                <div className="profile-details">
                    {profile.details.map((item) => (
                        <div key={item.label}>
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                        </div>
                    ))}
                </div>
                <button className="view-button" onClick={() => navigate('/')}>Logout</button>
            </div>
        </main>
    )
}

export default RoleProfile