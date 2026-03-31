import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Pagination from '../../components/common/Pagination'
import useDebounce from '../../hooks/useDebounce'
import { useAuth } from '../../contexts/AuthContext'

export default function UsersWorkStatusPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 })
  const debouncedSearch = useDebounce(search, 500)

  const fetchData = useCallback(async (page = 1, keyword = debouncedSearch) => {
    const { data } = await client.get(ENDPOINTS.userWorkStatus, { params: { page, limit: 10, search: keyword } })
    setRows(data.data)
    setMeta({ page: data.page, limit: data.limit, total: data.total })
  }, [debouncedSearch])

  useEffect(() => {
    fetchData(1)
  }, [fetchData])

  const taskPath = user?.role === 'admin' ? '/admin/tasks' : user?.role === 'sales' ? '/sales/tasks' : '/user/tasks'

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Status Kerja User</h2>
      </div>
      <div className="flex gap-2">
        <input className="input" value={search} placeholder="Cari user..." onChange={(e) => setSearch(e.target.value)} />
        <button className="btn border border-slate-200" onClick={() => fetchData(1, debouncedSearch)}>Cari</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tugas Aktif</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 font-medium text-slate-700">{row.name}</td>
                <td className="px-4 py-3 text-slate-600">{row.email}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.work_status === 'working' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {row.work_status === 'working' ? 'sedang mengerjakan tugas' : 'free'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.active_task_id ? (
                    <Link className="text-blue-600 underline" to={`${taskPath}?taskId=${row.active_task_id}`}>
                      {row.active_task_title}
                    </Link>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...meta} onChange={fetchData} />
    </div>
  )
}
