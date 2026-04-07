import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Pagination from '../../components/common/Pagination'

const leaveTypeLabel = (t) => (t === 'permission_late' ? 'Izin terlambat' : 'Izin sakit / tidak masuk')

export default function UserAttendancePage() {
  const [settings, setSettings] = useState(null)
  const [offices, setOffices] = useState([])
  const [selectedOfficeId, setSelectedOfficeId] = useState('')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 })
  const [lateSummary, setLateSummary] = useState(null)
  const [lateMonth, setLateMonth] = useState(() => dayjs().format('YYYY-MM'))
  const [leaveRows, setLeaveRows] = useState([])
  const [leaveMeta, setLeaveMeta] = useState({ page: 1, limit: 5, total: 0 })
  const [leaveForm, setLeaveForm] = useState({
    leave_date: dayjs().format('YYYY-MM-DD'),
    leave_type: 'sick',
    note: '',
  })

  const fetchData = async (page = 1) => {
    const [s, a, o] = await Promise.all([
      client.get(ENDPOINTS.settings),
      client.get(ENDPOINTS.attendance, { params: { page, limit: 10 } }),
      client.get(ENDPOINTS.offices),
    ])
    setSettings(s.data)
    setOffices(o.data || [])
    if (!selectedOfficeId && o.data?.length) setSelectedOfficeId(String(o.data[0].id))
    setRows(a.data.data)
    setMeta({ page: a.data.page, limit: a.data.limit, total: a.data.total })
  }

  const fetchLate = useCallback(async () => {
    const { data } = await client.get(ENDPOINTS.attendanceLatePointsMe, { params: { year_month: lateMonth } })
    setLateSummary(data)
  }, [lateMonth])

  const fetchLeaves = useCallback(async (page = 1) => {
    const { data } = await client.get(ENDPOINTS.attendanceLeave, { params: { page, limit: 5 } })
    setLeaveRows(data.data)
    setLeaveMeta({ page: data.page, limit: data.limit, total: data.total })
  }, [])

  useEffect(() => {
    fetchData(1)
  }, [])

  useEffect(() => {
    fetchLate()
  }, [fetchLate])

  useEffect(() => {
    fetchLeaves(1)
  }, [fetchLeaves])

  const withLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ latitude: null, longitude: null, location_note: 'gps tidak aktif / lokasi tidak diketahui' })
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, location_note: null }),
        () => resolve({ latitude: null, longitude: null, location_note: 'gps tidak aktif / lokasi tidak diketahui' }),
      )
    })

  const submit = async (type) => {
    if (!selectedOfficeId) {
      toast.error('Pilih lokasi kantor terlebih dahulu')
      return
    }
    try {
      const payload = await withLocation()
      await client.post(type === 'in' ? ENDPOINTS.attendanceCheckIn : ENDPOINTS.attendanceCheckOut, {
        ...payload,
        office_id: Number(selectedOfficeId),
      })
      toast.success(type === 'in' ? 'Check-in berhasil' : 'Check-out berhasil')
      fetchData(meta.page)
      fetchLate()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal simpan absensi')
    }
  }

  const submitLeave = async (e) => {
    e.preventDefault()
    const note = String(leaveForm.note || '').trim()
    if (!note) {
      toast.error('Keterangan wajib diisi agar tim tahu alasan izin / sakit / telat')
      return
    }
    try {
      await client.post(ENDPOINTS.attendanceLeave, {
        leave_date: leaveForm.leave_date,
        leave_type: leaveForm.leave_type,
        note,
      })
      toast.success('Izin tercatat — hanya Anda yang bisa mengajukan untuk akun Anda')
      setLeaveForm((p) => ({ ...p, note: '' }))
      fetchLeaves(1)
      fetchLate()
      fetchData(meta.page)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal simpan izin')
    }
  }

  const deleteLeave = async (id) => {
    if (!window.confirm('Hapus izin di tanggal ini?')) return
    try {
      await client.delete(`${ENDPOINTS.attendanceLeave}/${id}`)
      toast.success('Izin dihapus')
      fetchLeaves(leaveMeta.page)
      fetchLate()
      fetchData(meta.page)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal hapus izin')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-1 text-lg font-semibold">Absensi Harian</h2>
        <p className="text-sm text-slate-500">
          Jadwal masuk: {settings?.check_in_time || '-'} | Jadwal pulang: {settings?.check_out_time || '-'}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Check-in dan pengajuan izin hanya untuk akun Anda sendiri. Telat ≤ 1 jam = 1 poin; telat &gt; 1 jam = 2 poin. Izin sakit atau izin telat dengan
          keterangan = 0 poin.
        </p>
        <div className="mt-4 max-w-md">
          <label className="mb-1 block text-sm font-medium text-slate-700">Pilih Kantor (wajib)</label>
          <select className="input" value={selectedOfficeId} onChange={(e) => setSelectedOfficeId(e.target.value)} required>
            <option value="">-- Pilih kantor --</option>
            {offices.map((office) => (
              <option key={office.id} value={office.id}>
                {office.name} (radius {office.radius_meter} m)
              </option>
            ))}
          </select>
          {!offices.length ? <p className="mt-1 text-xs text-rose-600">Belum ada data kantor. Minta admin menambahkan kantor dulu.</p> : null}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={() => submit('in')} disabled={!offices.length}>
            Check-in
          </button>
          <button className="btn border border-slate-200" onClick={() => submit('out')} disabled={!offices.length}>
            Check-out
          </button>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Poin telat (bulan berjalan)</h3>
            <p className="text-sm text-slate-500">Estimasi potongan mengikuti nominal per poin di pengaturan admin.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Periode</label>
            <input className="input w-40" type="month" value={lateMonth} onChange={(e) => setLateMonth(e.target.value)} />
          </div>
        </div>
        {lateSummary && (
          <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-slate-500">Total poin</p>
              <p className="text-2xl font-bold text-[#11295a]">{lateSummary.total_points}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Per poin (Rp)</p>
              <p className="text-lg font-semibold text-slate-800">{Number(lateSummary.penalty_per_point_rupiah || 0).toLocaleString('id-ID')}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Estimasi potongan</p>
              <p className="text-lg font-semibold text-amber-800">Rp {Number(lateSummary.estimated_penalty_rupiah || 0).toLocaleString('id-ID')}</p>
            </div>
          </div>
        )}
        {lateSummary?.breakdown?.length ? (
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tanggal</th>
                  <th className="px-3 py-2">Check-in</th>
                  <th className="px-3 py-2">Menit telat</th>
                  <th className="px-3 py-2">Poin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lateSummary.breakdown.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2">{dayjs(b.attendance_date).format('DD MMM YYYY')}</td>
                    <td className="px-3 py-2">{b.check_in_time ? dayjs(b.check_in_time).format('HH:mm') : '-'}</td>
                    <td className="px-3 py-2">{b.late_minutes != null ? b.late_minutes : '-'}</td>
                    <td className="px-3 py-2 font-semibold text-amber-800">{b.late_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3 className="mb-1 text-lg font-semibold text-slate-800">Izin sakit / izin terlambat</h3>
        <p className="mb-4 text-sm text-slate-500">
          Wajib isi keterangan agar semua pihak tahu alasan Anda. Izin ini menggantungkan poin telat menjadi 0 untuk hari tersebut (tetap bisa check-in
          bila Anda masuk).
        </p>
        <form onSubmit={submitLeave} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal</label>
            <input
              className="input"
              type="date"
              value={leaveForm.leave_date}
              onChange={(e) => setLeaveForm({ ...leaveForm, leave_date: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Jenis</label>
            <select className="input" value={leaveForm.leave_type} onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
              <option value="sick">Izin sakit / tidak masuk kerja</option>
              <option value="permission_late">Izin terlambat (beberapa menit / jam)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Keterangan (wajib)</label>
            <textarea
              className="input min-h-[96px]"
              placeholder="Contoh: demam, kontrol dokter, macet tol, dll."
              value={leaveForm.note}
              onChange={(e) => setLeaveForm({ ...leaveForm, note: e.target.value })}
              required
            />
          </div>
          <button className="btn-primary md:col-span-2 max-w-fit">Kirim izin</button>
        </form>

        <div className="mt-6">
          <h4 className="mb-2 font-semibold text-slate-800">Riwayat izin saya</h4>
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Keterangan</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaveRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-700">{dayjs(row.leave_date).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-slate-600">{leaveTypeLabel(row.leave_type)}</td>
                    <td className="max-w-md px-4 py-3 text-slate-600">{row.note}</td>
                    <td className="px-4 py-3">
                      <button type="button" className="btn border border-rose-200 text-rose-700" onClick={() => deleteLeave(row.id)}>
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...leaveMeta} onChange={fetchLeaves} />
        </div>
      </div>

      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">Riwayat Absensi</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
                <th className="px-4 py-3">Menit telat</th>
                <th className="px-4 py-3">Poin</th>
                <th className="px-4 py-3">Izin hari ini</th>
                <th className="px-4 py-3">Kantor</th>
                <th className="px-4 py-3">GPS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-700">{dayjs(row.attendance_date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-3 text-slate-600">{row.check_in_time ? dayjs(row.check_in_time).format('HH:mm:ss') : '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.check_out_time ? dayjs(row.check_out_time).format('HH:mm:ss') : '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.late_minutes != null ? `${row.late_minutes} m` : '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        row.late_points > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.late_points ?? 0}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-600">
                    {row.leave_type ? (
                      <span className="text-xs">
                        <span className="font-medium text-[#11295a]">{leaveTypeLabel(row.leave_type)}</span>
                        {row.leave_note ? `: ${row.leave_note}` : ''}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.office_name_check_in || row.office_name_check_out || '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.gps_status_check_in === 'ON' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                    >
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
