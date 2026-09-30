import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import './employeeDashboard.css'

function EmployeeLayout() {
    const navigate = useNavigate()
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)

    return (
        <div className="employee-page">
            <header className="employee-header">
                <div className="logo">Employee Performance</div>

                <div className="header-user profile-area">
                    <button
                        className="profile-trigger"
                        onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                    >
                        {JSON.parse(localStorage.getItem('user') || '{}').name || 'Employee'} ▼
                    </button>

                    {isProfileMenuOpen && (
                        <div className="profile-menu">
                            <button onClick={() => navigate('/employee/profile')}>My Profile</button>
                            <button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/') }}>Logout</button>
                        </div>
                    )}
                </div>
            </header>

            <div className="employee-layout">
                <aside className="employee-sidebar employee-nav-sidebar">
                    <NavLink to="/employee" end className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>
                        Dashboard
                    </NavLink>
                    <NavLink to="/employee/work" className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>
                        My Work
                    </NavLink>
                    <NavLink to="/employee/appeals" className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>
                        My Appeals
                    </NavLink>
                    <NavLink to="/employee/profile" className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}>
                        My Profile
                    </NavLink>
                </aside>

                <Outlet />
            </div>
        </div>
    )
}

export default EmployeeLayout