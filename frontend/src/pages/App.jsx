import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/login'
import EmployeeDashboard from './pages/EmployeeDashboard'
import EmployeeLayout from './pages/EmployeeLayout'
import EmployeeWork from './pages/EmployeeWork'
import EmployeeAppeals from './pages/EmployeeAppeals'
import EmployeeProfile from './pages/EmployeeProfile'
import RoleLayout from './pages/RoleLayout'
import RoleProfile from './pages/RoleProfile'
import ManagerDashboard from './pages/ManagerDashboard'
import ManagerWork from './pages/ManagerWork'
import SeniorDashboard from './pages/SeniorDashboard'
import SeniorAppeals from './pages/SeniorAppeals'
import SeniorWork from './pages/SeniorWork'
import AssignWork from './pages/AssignWork'

const managerProfile = {
    path: '/manager/profile',
    details: [
        { label: 'Name', value: 'Manager Sharma' },
        { label: 'Email', value: 'manager@example.com' },
        { label: 'Employee/Manager ID', value: 'MGR001' },
        { label: 'Department', value: 'Computer Science' },
        { label: 'Designation', value: 'Chief Manager' },
        { label: 'Role', value: 'Chief Manager' },
    ],
}

const seniorProfile = {
    path: '/senior/profile',
    details: [
        { label: 'Name', value: 'Senior Authority' },
        { label: 'Email', value: 'senior@example.com' },
        { label: 'Employee ID', value: 'SNR001' },
        { label: 'Department', value: 'Computer Science' },
        { label: 'Designation', value: 'Senior Authority' },
        { label: 'Role', value: 'Senior Authority' },
    ],
}

function App() {
    return (
        <BrowserRouter>
            <Routes>

                <Route path="/" element={<Login />} />

                <Route path="/employee" element={<EmployeeLayout />}>
                    <Route index element={<EmployeeDashboard />} />
                    <Route path="work" element={<EmployeeWork />} />
                    <Route path="appeals" element={<EmployeeAppeals />} />
                    <Route path="profile" element={<EmployeeProfile />} />
                </Route>

                <Route
                    path="/manager"
                    element={
                        <RoleLayout
                            role="Chief Manager"
                            basePath="/manager"
                            secondaryLabel="My Team's Work"
                            secondaryPath="/manager/work"
                            profile={managerProfile}
                        />
                    }
                >
                    <Route index element={<ManagerDashboard />} />

                    <Route path="work" element={<ManagerWork />} />

                    <Route path="assign-work" element={<AssignWork />} />

                    <Route
                        path="profile"
                        element={<RoleProfile profile={managerProfile} />}
                    />
                </Route>

                <Route path="/senior" element={<RoleLayout role="Senior Authority" basePath="/senior" secondaryLabel="Appeals" secondaryPath="/senior/appeals" extraLabel="Employee Work" extraPath="/senior/work" profile={seniorProfile} />}>
                    <Route index element={<SeniorDashboard />} />
                    <Route path="appeals" element={<SeniorAppeals />} />
                    <Route path="work" element={<SeniorWork />} />
                    <Route path="profile" element={<RoleProfile profile={seniorProfile} />} />
                </Route>

            </Routes>
        </BrowserRouter>
    )
}

export default App