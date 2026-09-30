import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import './employeeDashboard.css'

function RoleLayout({ role, basePath, secondaryLabel, secondaryPath, profile, extraPath, extraLabel }) {
    const navigate = useNavigate()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const isManager = role === 'Chief Manager'

    const user = JSON.parse(localStorage.getItem('user') || '{}')

    function logout() {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        navigate('/')
    }

    return (
        <div className="employee-page">
            <header className="employee-header">
                <div className="logo">Employee Performance</div>
                <div className="header-user profile-area">
                    <button className="profile-trigger" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                        {user.name || role} ▼
                    </button>
                    {isMenuOpen && (
                        <div className="profile-menu">
                            <button onClick={() => navigate(profile.path)}>My Profile</button>
                            <button onClick={logout}>Logout</button>
                        </div>
                    )}
                </div>
            </header>

            <div className="employee-layout">
                <aside className="employee-sidebar">
                    <h3>Menu</h3>
                    <NavLink to={basePath} end className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>Dashboard</NavLink>
                    <NavLink to={secondaryPath} className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>{secondaryLabel}</NavLink>
                    {extraPath && <NavLink to={extraPath} className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>{extraLabel}</NavLink>}
                    {isManager && <NavLink to="/manager/assign-work" className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>Assign Work</NavLink>}
                    <NavLink to={profile.path} className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>My Profile</NavLink>
                </aside>
                <Outlet />
            </div>
        </div>
    )
}

export default RoleLayout
