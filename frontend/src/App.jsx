import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './pages/auth/LoginPage'
import UserAttendancePage from './pages/user/UserAttendancePage'
import UserTasksPage from './pages/user/UserTasksPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminAttendancePage from './pages/admin/AdminAttendancePage'
import AdminTasksPage from './pages/admin/AdminTasksPage'
import UsersWorkStatusPage from './pages/shared/UsersWorkStatusPage'
import AppShell from './components/layout/AppShell'

function Protected({ roles, children }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (!user) return <Navigate to="/login" replace />
  if (roles?.length && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  if (user.role === 'sales') return <Navigate to="/sales/tasks" replace />
  return <Navigate to="/user/attendance" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/user"
        element={
          <Protected roles={['user']}>
            <AppShell />
          </Protected>
        }
      >
        <Route path="attendance" element={<UserAttendancePage />} />
        <Route path="tasks" element={<UserTasksPage />} />
        <Route path="users-status" element={<UsersWorkStatusPage />} />
      </Route>

      <Route
        path="/sales"
        element={
          <Protected roles={['sales']}>
            <AppShell />
          </Protected>
        }
      >
        <Route path="tasks" element={<UserTasksPage />} />
        <Route path="users-status" element={<UsersWorkStatusPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <Protected roles={['admin']}>
            <AppShell />
          </Protected>
        }
      >
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="attendance" element={<AdminAttendancePage />} />
        <Route path="tasks" element={<AdminTasksPage />} />
        <Route path="users-status" element={<UsersWorkStatusPage />} />
      </Route>
    </Routes>
  )
}
