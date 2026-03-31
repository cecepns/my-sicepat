import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import AsyncSelect from 'react-select/async'
import DatePicker from 'react-datepicker'
import { FileText, Image as ImageIcon, ImagePlus, Search, Trash2, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Pagination from '../../components/common/Pagination'
import useDebounce from '../../hooks/useDebounce'
import Modal from '../../components/common/Modal'

export default function AdminTasksPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [date, setDate] = useState(null)
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 })
  const [detailTask, setDetailTask] = useState(null)
  const [openCreateModal, setOpenCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', description: '', deadline_date: '', status: 'todo' })
  const [createUser, setCreateUser] = useState(null)
  const [createScope, setCreateScope] = useState('single')
  const [createFiles, setCreateFiles] = useState([])
  const [createDragActive, setCreateDragActive] = useState(false)
  const debouncedSearch = useDebounce(search, 1000)

  const loadUsers = async (inputValue) => {
    const { data } = await client.get(ENDPOINTS.selectUsers, { params: { search: inputValue } })
    return data.map((user) => ({ value: user.id, label: user.name }))
  }

  const fetchData = useCallback(async (page = 1) => {
    const { data } = await client.get(ENDPOINTS.tasks, {
      params: {
        page,
        limit: 10,
        search: debouncedSearch,
        user_id: selectedUser?.value || '',
        date: date ? dayjs(date).format('YYYY-MM-DD') : '',
      },
    })
    setRows(data.data)
    setMeta({ page: data.page, limit: data.limit, total: data.total })
  }, [debouncedSearch, selectedUser, date])

  useEffect(() => {
    fetchData(1)
  }, [fetchData])

  useEffect(() => {
    const taskId = new URLSearchParams(location.search).get('taskId')
    if (!taskId || !rows.length) return
    const found = rows.find((item) => String(item.id) === String(taskId))
    if (found) {
      setDetailTask(found)
      navigate('/admin/tasks', { replace: true })
    }
  }, [location.search, rows, navigate])

  const getStatusBadge = (status) => {
    const map = {
      todo: 'bg-slate-100 text-slate-700',
      in_progress: 'bg-amber-100 text-amber-700',
      done: 'bg-emerald-100 text-emerald-700',
      cancelled: 'bg-rose-100 text-rose-700',
    }
    return map[status] || 'bg-slate-100 text-slate-700'
  }

  const isImage = (mimeType = '') => mimeType.startsWith('image/')
  const formatDuration = (seconds) => {
    const safe = Number(seconds || 0)
    if (!safe || safe < 1) return '-'
    const hour = Math.floor(safe / 3600)
    const minute = Math.floor((safe % 3600) / 60)
    const second = safe % 60
    return `${hour}j ${minute}m ${second}d`
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Yakin ingin menghapus tugas ini? Semua attachment akan ikut terhapus.')) return
    try {
      await client.delete(`${ENDPOINTS.tasks}/${taskId}`)
      toast.success('Tugas berhasil dihapus')
      if (detailTask?.id === taskId) setDetailTask(null)
      fetchData(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal hapus tugas')
    }
  }

  const handleCreateFiles = async (inputFiles) => {
    if (!inputFiles?.length) return
    setCreateFiles(Array.from(inputFiles))
  }

  const resetCreateState = () => {
    setCreateForm({ title: '', description: '', deadline_date: '', status: 'todo' })
    setCreateUser(null)
    setCreateScope('single')
    setCreateFiles([])
    setCreateDragActive(false)
  }

  const submitCreate = async (e) => {
    e.preventDefault()
    if (createScope === 'single' && !createUser?.value) {
      toast.error('Pilih pegawai/teknisi yang ditugaskan')
      return
    }
    try {
      const formData = new FormData()
      formData.append('title', createForm.title)
      formData.append('description', createForm.description || '')
      formData.append('deadline_date', createForm.deadline_date || '')
      formData.append('status', createForm.status || 'todo')
      formData.append('assignment_scope', createScope)
      if (createScope === 'single') formData.append('assigned_user_id', String(createUser.value))
      createFiles.forEach((file) => formData.append('attachments', file))
      await client.post(ENDPOINTS.tasks, formData)
      toast.success('Tugas berhasil dibuat')
      resetCreateState()
      setOpenCreateModal(false)
      fetchData(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal membuat tugas')
    }
  }

  return (
    <div className="card">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start">
        <input className="input lg:w-[40%]" placeholder="Search tugas / user..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <AsyncSelect
          placeholder="Filter user (search by API)"
          value={selectedUser}
          onChange={setSelectedUser}
          loadOptions={loadUsers}
          defaultOptions
          cacheOptions
          className="lg:w-[30%]"
        />
        <DatePicker selected={date} onChange={setDate} className="input lg:w-56" placeholderText="Filter tanggal" dateFormat="yyyy-MM-dd" />
        <button className="btn bg-[#11295a] text-white hover:opacity-90 lg:w-28 lg:shrink-0" onClick={() => fetchData(1)}>Filter</button>
        <button className="btn bg-emerald-600 text-white hover:opacity-90 lg:w-40 lg:shrink-0" onClick={() => setOpenCreateModal(true)}>
          + Buat Tugas
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((task) => (
          <div className="rounded-xl border border-slate-100 p-3" key={task.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{task.title}</p>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(task.status)}`}>{task.status}</span>
                <button className="btn inline-flex items-center gap-1 bg-[#11295a] text-white hover:opacity-90" onClick={() => setDetailTask(task)}>
                  <Search size={14} /> Detail
                </button>
                <button className="btn inline-flex items-center gap-1 bg-rose-600 text-white hover:opacity-90" onClick={() => handleDeleteTask(task.id)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Teknisi: {task.user_name}
              {task.created_by_name ? ` · Dibuat oleh: ${task.created_by_name} (${task.created_by_role || 'admin'})` : ''}
            </p>
            {task.assignment_scope === 'all_technicians' ? (
              <p className="text-xs text-slate-500">
                Tugas untuk semua teknisi · Pengambil: {task.claimed_by?.length ? task.claimed_by.map((item) => item.user_name).join(', ') : '-'}
              </p>
            ) : null}
            <p className="text-sm text-slate-600">{task.description || '-'}</p>
            <p className="text-xs text-slate-500">
              Created: {dayjs(task.created_at).format('DD MMM YYYY HH:mm')} | Deadline: {task.deadline_date ? dayjs(task.deadline_date).format('DD MMM YYYY') : '-'}
            </p>
            <p className="text-xs text-slate-500">Durasi kerja: {formatDuration(task.work_duration_seconds)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {task.attachments?.map((att) => (
                <a
                  key={att.id}
                  className={`btn inline-flex items-center gap-1 text-xs text-white hover:opacity-90 ${isImage(att.mime_type) ? 'bg-emerald-600' : 'bg-slate-700'}`}
                  target="_blank"
                  href={`https://api-inventory.isavralabel.com/my-sicepat/uploads-my-sicepat/${att.stored_name}`}
                  rel="noreferrer"
                >
                  {isImage(att.mime_type) ? <ImageIcon size={14} /> : <FileText size={14} />}
                  {isImage(att.mime_type) ? 'Lihat Gambar' : 'Lihat File'}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Pagination {...meta} onChange={fetchData} />

      <Modal open={Boolean(detailTask)} title="Detail Tugas User" onClose={() => setDetailTask(null)} maxWidth="max-w-4xl">
        {detailTask && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">{detailTask.title}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(detailTask.status)}`}>{detailTask.status}</span>
            </div>
            <p className="text-sm text-slate-600">
              Teknisi: {detailTask.user_name}
              {detailTask.created_by_name ? ` · Dibuat oleh: ${detailTask.created_by_name} (${detailTask.created_by_role || 'admin'})` : ''}
            </p>
            {detailTask.assignment_scope === 'all_technicians' ? (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Pengambil tugas: </span>
                {detailTask.claimed_by?.length ? detailTask.claimed_by.map((item) => item.user_name).join(', ') : 'Belum ada'}
              </p>
            ) : null}
            <p className="text-sm text-slate-600">{detailTask.description || '-'}</p>
            {detailTask.work_progress_note ? (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Catatan pengerjaan: </span>
                {detailTask.work_progress_note}
              </p>
            ) : null}
            {detailTask.completion_report ? (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Laporan penyelesaian: </span>
                {detailTask.completion_report}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              Created: {dayjs(detailTask.created_at).format('DD MMM YYYY HH:mm')} | Deadline: {detailTask.deadline_date ? dayjs(detailTask.deadline_date).format('DD MMM YYYY') : '-'}
            </p>
            <p className="text-xs text-slate-500">Durasi kerja: {formatDuration(detailTask.work_duration_seconds)}</p>
            <div className="pt-1">
              <p className="mb-2 text-sm font-medium text-slate-700">Attachments</p>
              <div className="flex flex-wrap gap-2">
                {detailTask.attachments?.length ? (
                  detailTask.attachments.map((att) => (
                    <a
                      key={att.id}
                      className={`btn inline-flex items-center gap-1 text-xs text-white hover:opacity-90 ${isImage(att.mime_type) ? 'bg-emerald-600' : 'bg-slate-700'}`}
                      target="_blank"
                      href={`https://api-inventory.isavralabel.com/my-sicepat/uploads-my-sicepat/${att.stored_name}`}
                      rel="noreferrer"
                    >
                      {isImage(att.mime_type) ? <ImageIcon size={14} /> : <FileText size={14} />}
                      {isImage(att.mime_type) ? 'Lihat Gambar' : 'Lihat File'}
                    </a>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">Tidak ada attachment</span>
                )}
              </div>
            </div>
            <div>
              <button className="btn inline-flex items-center gap-1 bg-rose-600 text-white hover:opacity-90" onClick={() => handleDeleteTask(detailTask.id)}>
                <Trash2 size={14} /> Delete Tugas
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={openCreateModal} title="Buat Tugas untuk Pegawai" onClose={() => { setOpenCreateModal(false); resetCreateState() }} maxWidth="max-w-4xl">
        <form onSubmit={submitCreate} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Jenis Penugasan *</label>
            <select className="input" value={createScope} onChange={(e) => setCreateScope(e.target.value)}>
              <option value="single">Per teknisi (pilih 1)</option>
              <option value="all_technicians">Semua teknisi (maks 2 pengambil)</option>
            </select>
          </div>
          {createScope === 'single' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Pegawai / Teknisi *</label>
              <AsyncSelect
                placeholder="Pilih pegawai yang ditugaskan"
                value={createUser}
                onChange={setCreateUser}
                loadOptions={loadUsers}
                defaultOptions
                cacheOptions
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Judul Tugas</label>
            <input
              className="input"
              placeholder="Contoh: Instalasi internet pelanggan"
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi</label>
            <textarea
              className="input"
              placeholder="Detail pekerjaan, alamat, catatan khusus..."
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Deadline</label>
              <input
                className="input"
                type="date"
                value={createForm.deadline_date}
                onChange={(e) => setCreateForm({ ...createForm, deadline_date: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Status awal</label>
              <select
                className="input"
                value={createForm.status}
                onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
              >
                <option value="todo">todo</option>
                <option value="in_progress">in_progress</option>
                <option value="done">done</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Lampiran (opsional)</label>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${
                createDragActive ? 'border-brand-red bg-red-50' : 'border-slate-200 bg-slate-50 hover:border-brand-red/60'
              }`}
              onDragOver={(e) => {
                e.preventDefault()
                setCreateDragActive(true)
              }}
              onDragLeave={() => setCreateDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setCreateDragActive(false)
                handleCreateFiles(e.dataTransfer.files)
              }}
            >
              <input className="hidden" type="file" multiple onChange={(e) => handleCreateFiles(e.target.files)} />
              <ImagePlus size={26} className="mb-2 text-slate-500" />
              <p className="text-sm font-medium text-slate-700">Klik atau drag-drop file</p>
            </label>
          </div>
          {!!createFiles.length && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">File terpilih ({createFiles.length})</p>
              <ul className="text-xs text-slate-600">
                {createFiles.map((f) => (
                  <li key={`${f.name}-${f.lastModified}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <span>{Math.round(f.size / 1024)} KB</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn inline-flex items-center gap-1 border border-rose-200 text-rose-600"
                onClick={() => setCreateFiles([])}
              >
                <X size={14} /> Hapus Semua File
              </button>
            </div>
          )}
          <button className="btn-primary">Simpan Tugas</button>
        </form>
      </Modal>
    </div>
  )
}
