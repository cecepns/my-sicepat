import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import DatePicker from 'react-datepicker'
import AsyncSelect from 'react-select/async'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Pagination from '../../components/common/Pagination'
import Modal from '../../components/common/Modal'
import useDebounce from '../../hooks/useDebounce'

export default function AdminAttendancePage() {
  const [search, setSearch] = useState('')
  const [date, setDate] = useState(null)
  const [settings, setSettings] = useState(null)
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 })
  const [selectedUser, setSelectedUser] = useState(null)
  const [markForm, setMarkForm] = useState({ user_id: '', attendance_date: '', check_in_time: '', check_out_time: '', note: '' })
  const [openMarkModal, setOpenMarkModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const debouncedSearch = useDebounce(search, 1000)

  const loadUsers = async (inputValue) => {
    const { data } = await client.get(ENDPOINTS.selectUsers, { params: { search: inputValue || '' } })
    return data.map((user) => ({ value: String(user.id), label: user.name }))
  }

  const fetchData = useCallback(async (page = 1) => {
    const { data } = await client.get(ENDPOINTS.attendance, {
      params: { page, limit: 10, search: debouncedSearch, date: date ? dayjs(date).format('YYYY-MM-DD') : '' },
    })
    setRows(data.data)
    setMeta({ page: data.page, limit: data.limit, total: data.total })
  }, [debouncedSearch, date])

  useEffect(() => {
    fetchData(1)
  }, [fetchData])

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await client.get(ENDPOINTS.settings)
        setSettings(data)
      } catch {
        setSettings(null)
      }
    }
    fetchSettings()
  }, [])

  const getLateLabel = (row) => {
    if (!settings?.check_in_time || !row.check_in_time) return '-'

    const checkIn = dayjs(row.check_in_time)
    const schedule = dayjs(`${dayjs(row.attendance_date).format('YYYY-MM-DD')} ${settings.check_in_time}`)
    if (!checkIn.isAfter(schedule)) return 'Tepat waktu'

    const diffMinutes = checkIn.diff(schedule, 'minute')
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60

    if (hours > 0 && minutes > 0) return `Terlambat (${hours} jam ${minutes} menit)`
    if (hours > 0) return `Terlambat (${hours} jam)`
    return `Terlambat (${minutes} menit)`
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!markForm.user_id) {
      toast.error('Pilih user terlebih dahulu')
      return
    }
    try {
      const payload = {
        ...markForm,
        check_in_time: markForm.check_in_time ? markForm.check_in_time.replace('T', ' ') : null,
        check_out_time: markForm.check_out_time ? markForm.check_out_time.replace('T', ' ') : null,
      }
      if (editingId) {
        await client.put(`${ENDPOINTS.attendance}/${editingId}`, payload)
        toast.success('Absensi berhasil diupdate')
      } else {
        await client.post(ENDPOINTS.attendanceAdminMark, payload)
        toast.success('Absensi user tersimpan')
      }
      setOpenMarkModal(false)
      setEditingId(null)
      setSelectedUser(null)
      setMarkForm({ user_id: '', attendance_date: '', check_in_time: '', check_out_time: '', note: '' })
      fetchData(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal simpan absensi')
    }
  }

  const handleEdit = (row) => {
    setEditingId(row.id)
    setSelectedUser({ value: String(row.user_id), label: row.user_name })
    setMarkForm({
      user_id: String(row.user_id),
      attendance_date: dayjs(row.attendance_date).format('YYYY-MM-DD'),
      check_in_time: row.check_in_time ? dayjs(row.check_in_time).format('YYYY-MM-DDTHH:mm') : '',
      check_out_time: row.check_out_time ? dayjs(row.check_out_time).format('YYYY-MM-DDTHH:mm') : '',
      note: row.admin_note || '',
    })
    setOpenMarkModal(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin ingin menghapus data absensi ini?')) return
    try {
      await client.delete(`${ENDPOINTS.attendance}/${id}`)
      toast.success('Absensi berhasil dihapus')
      fetchData(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal menghapus absensi')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Manajemen Absensi</h2>
          <button
            className="btn-primary"
            onClick={() => {
              setEditingId(null)
              setSelectedUser(null)
              setMarkForm({ user_id: '', attendance_date: '', check_in_time: '', check_out_time: '', note: '' })
              setOpenMarkModal(true)
            }}
          >
            + Absenkan User
          </button>
        </div>
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-start">
          <input
            className="input lg:w-44"
            placeholder="Search User..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DatePicker selected={date} onChange={setDate} className="input lg:w-56" placeholderText="Filter tanggal" dateFormat="yyyy-MM-dd" />
          <button className="btn bg-[#11295a] text-white hover:opacity-90 lg:w-28 lg:shrink-0" onClick={() => fetchData(1)}>
            Filter
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
                <th className="px-4 py-3">Jarak ke Kantor</th>
                <th className="px-4 py-3">Status Check-in</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80">
                  {(() => {
                    const lateLabel = getLateLabel(r)
                    const isLate = lateLabel.startsWith('Terlambat')
                    const isUnknown = lateLabel === '-'
                    return (
                      <>
                  <td className="px-4 py-3 font-medium text-slate-700">{r.user_name}</td>
                  <td className="px-4 py-3 text-slate-600">{dayjs(r.attendance_date).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-3 text-slate-600">{r.check_in_time ? dayjs(r.check_in_time).format('HH:mm:ss') : '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.check_out_time ? dayjs(r.check_out_time).format('HH:mm:ss') : '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.distance_km_check_in ? `${r.distance_km_check_in} km` : '-'}</td>
                  <td className="px-4 py-3">
                    {isUnknown ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">-</span>
                    ) : isLate ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">{lateLabel}</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{lateLabel}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="btn bg-amber-500 text-white hover:opacity-90" onClick={() => handleEdit(r)}>
                        Edit
                      </button>
                      <button className="btn bg-rose-600 text-white hover:opacity-90" onClick={() => handleDelete(r.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                      </>
                    )
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...meta} onChange={fetchData} />
      </div>

      <Modal
        open={openMarkModal}
        title={editingId ? 'Edit Absensi User' : 'Absenkan User'}
        onClose={() => {
          setOpenMarkModal(false)
          setEditingId(null)
          setSelectedUser(null)
          setMarkForm({ user_id: '', attendance_date: '', check_in_time: '', check_out_time: '', note: '' })
        }}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">User</label>
            <AsyncSelect
              cacheOptions
              defaultOptions
              loadOptions={loadUsers}
              value={selectedUser}
              placeholder="Pilih user (search by API)"
              onChange={(option) => {
                setSelectedUser(option)
                setMarkForm({ ...markForm, user_id: option?.value || '' })
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Absensi</label>
            <input className="input" type="date" value={markForm.attendance_date} onChange={(e) => setMarkForm({ ...markForm, attendance_date: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Waktu Check-in</label>
            <input className="input" type="datetime-local" value={markForm.check_in_time} onChange={(e) => setMarkForm({ ...markForm, check_in_time: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Waktu Check-out</label>
            <input className="input" type="datetime-local" value={markForm.check_out_time} onChange={(e) => setMarkForm({ ...markForm, check_out_time: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Catatan (Opsional)</label>
            <textarea className="input" placeholder="Tambahkan catatan jika perlu" value={markForm.note} onChange={(e) => setMarkForm({ ...markForm, note: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <button className="btn-primary">{editingId ? 'Update Absensi' : 'Simpan Absensi'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
