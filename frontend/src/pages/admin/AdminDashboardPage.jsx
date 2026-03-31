import { useEffect, useState } from 'react'
import { ClipboardCheck, ListTodo, Users } from 'lucide-react'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ users: 0, attendance: 0, tasks: 0 })

  useEffect(() => {
    const run = async () => {
      const [users, attendance, tasks] = await Promise.all([
        client.get(ENDPOINTS.users, { params: { page: 1, limit: 1 } }),
        client.get(ENDPOINTS.attendance, { params: { page: 1, limit: 1 } }),
        client.get(ENDPOINTS.tasks, { params: { page: 1, limit: 1 } }),
      ])
      setStats({ users: users.data.total, attendance: attendance.data.total, tasks: tasks.data.total })
    }
    run()
  }, [])

  const cards = [
    {
      label: 'Total Users',
      value: stats.users,
      icon: Users,
      iconWrapClass: 'bg-blue-100 text-blue-700',
    },
    {
      label: 'Total Absensi',
      value: stats.attendance,
      icon: ClipboardCheck,
      iconWrapClass: 'bg-emerald-100 text-emerald-700',
    },
    {
      label: 'Total Tugas',
      value: stats.tasks,
      icon: ListTodo,
      iconWrapClass: 'bg-violet-100 text-violet-700',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-r from-[#11295a] to-[#1d4d9b] p-6 text-white">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-white/80">Monitoring aktivitas absensi dan tugas pegawai</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-slate-500">{card.label}</p>
              <div className={`rounded-xl p-2 ${card.iconWrapClass}`}>
                <card.icon size={20} />
              </div>
            </div>
            <p className="text-3xl font-bold text-[#11295a]">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
