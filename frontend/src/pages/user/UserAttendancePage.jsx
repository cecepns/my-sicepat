import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Pagination from '../../components/common/Pagination'

export default function UserAttendancePage() {
  const [settings, setSettings] = useState(null)
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 })

  const fetchData = async (page = 1) => {
    const [s, a] = await Promise.all([
      client.get(ENDPOINTS.settings),
      client.get(ENDPOINTS.attendance, { params: { page, limit: 10 } }),
    ])
    setSettings(s.data)
    setRows(a.data.data)
    setMeta({ page: a.data.page, limit: a.data.limit, total: a.data.total })
  }

  useEffect(() => {
    fetchData(1)
  }, [])

  const withLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ latitude: null, longitude: null, location_note: 'gps tidak aktif / lokasi tidak diketahui' })
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, location_note: null }),
        () => resolve({ latitude: null, longitude: null, location_note: 'gps tidak aktif / lokasi tidak diketahui' }),
      )
    })

  const submit = async (type) => {
    try {
      const payload = await withLocation()
      await client.post(type === 'in' ? ENDPOINTS.attendanceCheckIn : ENDPOINTS.attendanceCheckOut, payload)
      toast.success(type === 'in' ? 'Check-in berhasil' : 'Check-out berhasil')
      fetchData(meta.page)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal simpan absensi')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-1 text-lg font-semibold">Absensi Harian</h2>
        <p className="text-sm text-slate-500">
          Jadwal masuk: {settings?.check_in_time || '-'} | Jadwal pulang: {settings?.check_out_time || '-'}
        </p>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={() => submit('in')}>
            Check-in
          </button>
          <button className="btn border border-slate-200" onClick={() => submit('out')}>
            Check-out
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">Riwayat Absensi</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
                <th className="px-4 py-3">Status GPS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-700">{dayjs(row.attendance_date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-3 text-slate-600">{row.check_in_time ? dayjs(row.check_in_time).format('HH:mm:ss') : '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.check_out_time ? dayjs(row.check_out_time).format('HH:mm:ss') : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.gps_status_check_in === 'ON' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {row.gps_status_check_in === 'ON' ? 'Aktif' : 'GPS tidak aktif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...meta} onChange={fetchData} />
      </div>
    </div>
  )
}
