import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const menuByRole = {
  user: [
    { to: '/user/attendance', label: 'Absensi' },
    { to: '/user/tasks', label: 'Tugas Saya' },
    { to: '/user/customers', label: 'Pelanggan' },
    { to: '/user/users-status', label: 'Status User' },
  ],
  sales: [
    { to: '/sales/tasks', label: 'Tugas Teknisi' },
    { to: '/sales/attendance', label: 'Absensi' },
    { to: '/sales/customers', label: 'Pelanggan' },
    { to: '/sales/users-status', label: 'Status Teknisi' },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/customers', label: 'Pelanggan' },
    { to: '/admin/settings', label: 'Settings' },
    { to: '/admin/attendance', label: 'Absensi' },
    { to: '/admin/tasks', label: 'Tugas Pegawai' },
    { to: '/admin/users-status', label: 'Status User' },
  ],
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const menus = menuByRole[user?.role || 'user']

  const SidebarContent = () => (
    <>
      <div className="mb-8 flex items-center gap-3">
        <img src="/assets/logo.png" className="h-10 w-10 rounded-full bg-white p-1" />
        <div>
          <p className="text-xs text-slate-300">My Sicepat</p>
          <p className="font-semibold">
            {user?.role === 'admin' ? 'Admin Panel' : user?.role === 'sales' ? 'Sales Panel' : 'User Panel'}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {menus.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `block rounded-xl px-3 py-2 text-sm ${isActive ? 'bg-white text-[#11295a]' : 'text-slate-100 hover:bg-white/10'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 bg-[#11295a] p-5 text-white md:block">
        <SidebarContent />
      </aside>

      <div className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setMobileOpen(false)} />
      <aside
        className={`fixed left-0 top-0 z-50 h-screen w-64 bg-[#11295a] p-5 text-white transition-transform duration-300 md:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <SidebarContent />
      </aside>

      <main className="min-h-screen md:ml-64">
        <div className="p-4 md:p-6">
          <header className="mb-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <button className="btn border border-slate-200 md:hidden" onClick={() => setMobileOpen(true)}>
                Menu
              </button>
              <div>
                <p className="text-sm text-slate-500">Welcome</p>
                <p className="font-semibold">{user?.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to="/" className="btn border border-slate-200">
                Home
              </Link>
              <button className="btn bg-slate-800 text-white" onClick={logout}>
                Logout
              </button>
            </div>
          </header>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
