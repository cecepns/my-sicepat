import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import Compressor from 'compressorjs'
import AsyncSelect from 'react-select/async'
import { CheckCircle2, FileText, Image as ImageIcon, ImagePlus, MapPin, Pencil, PlayCircle, Search, Trash2, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Pagination from '../../components/common/Pagination'
import useDebounce from '../../hooks/useDebounce'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

const statusOptions = ['todo', 'in_progress', 'done', 'cancelled']

export default function UserTasksPage() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const isSales = user?.role === 'sales'
  const isTech = user?.role === 'user'
  const tasksBasePath = isSales ? '/sales/tasks' : '/user/tasks'

  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 })
  const [form, setForm] = useState({ title: '', description: '', deadline_date: '', status: 'todo', location_source: 'manual', location_note: '' })
  const [files, setFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const [openCreateModal, setOpenCreateModal] = useState(false)
  const [selectedTechnician, setSelectedTechnician] = useState(null)

  const [editTask, setEditTask] = useState(null)
  const [detailTask, setDetailTask] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', deadline_date: '', status: 'todo', location_source: 'manual', location_note: '' })
  const [techEditNote, setTechEditNote] = useState('')
  const [editFiles, setEditFiles] = useState([])
  const [editDragActive, setEditDragActive] = useState(false)
  const [taskActionLoading, setTaskActionLoading] = useState(false)
  const [formLocation, setFormLocation] = useState({ latitude: null, longitude: null })
  const [editLocation, setEditLocation] = useState({ latitude: null, longitude: null })

  const [startModalTask, setStartModalTask] = useState(null)
  const [startForm, setStartForm] = useState({ location_source: 'manual', location_note: '', latitude: null, longitude: null })

  const [finishModalTask, setFinishModalTask] = useState(null)
  const [finishReport, setFinishReport] = useState('')
  const [finishFiles, setFinishFiles] = useState([])
  const [finishForm, setFinishForm] = useState({ location_source: 'manual', location_note: '', latitude: null, longitude: null })

  const cameraCreateRef = useRef(null)
  const galleryCreateRef = useRef(null)
  const fileCreateRef = useRef(null)
  const cameraEditRef = useRef(null)
  const galleryEditRef = useRef(null)
  const fileEditRef = useRef(null)
  const cameraFinishRef = useRef(null)
  const galleryFinishRef = useRef(null)

  const debouncedSearch = useDebounce(search, 1000)

  const loadTechnicians = async (inputValue) => {
    const { data } = await client.get(ENDPOINTS.selectUsers, { params: { search: inputValue || '' } })
    return data.map((row) => ({ value: row.id, label: row.name }))
  }

  const fetchData = useCallback(async (page = 1, keyword = debouncedSearch) => {
    const { data } = await client.get(ENDPOINTS.tasks, { params: { page, limit: 10, search: keyword } })
    setRows(data.data)
    setMeta({ page: data.page, limit: data.limit, total: data.total })
  }, [debouncedSearch])

  useEffect(() => {
    fetchData(1)
  }, [fetchData])

  useEffect(() => {
    const taskId = new URLSearchParams(location.search).get('taskId')
    if (!taskId || !rows.length) return
    const found = rows.find((item) => String(item.id) === String(taskId))
    if (found) {
      setDetailTask(found)
      navigate(tasksBasePath, { replace: true })
    }
  }, [location.search, rows, navigate, tasksBasePath])

  const compressImage = (file) =>
    new Promise((resolve) => {
      if (!file.type.startsWith('image/')) return resolve(file)
      const toNamedFile = (blobLike) =>
        new File([blobLike], file.name, {
          type: blobLike.type || file.type,
          lastModified: Date.now(),
        })

      new Compressor(file, {
        quality: 0.7,
        maxWidth: 1920,
        success(result) {
          if (result.size <= 500 * 1024) return resolve(toNamedFile(result))
          new Compressor(result, {
            quality: 0.5,
            success(nextResult) {
              resolve(toNamedFile(nextResult))
            },
            error: () => resolve(file),
          })
        },
        error() {
          resolve(file)
        },
      })
    })

  const compressFiles = async (inputFiles) => {
    if (!inputFiles?.length) return []
    return Promise.all(Array.from(inputFiles).map(compressImage))
  }

  const handleFiles = async (inputFiles) => {
    const compressed = await compressFiles(inputFiles)
    setFiles(compressed)
  }

  const handleEditFiles = async (inputFiles) => {
    const compressed = await compressFiles(inputFiles)
    setEditFiles(compressed)
  }

  const handleFinishFiles = async (inputFiles) => {
    const compressed = await compressFiles(inputFiles)
    setFinishFiles(compressed)
  }

  const imagePreviews = useMemo(
    () =>
      files.filter((file) => file.type?.startsWith('image/')).map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        size: Math.round(file.size / 1024),
      })),
    [files],
  )

  const editImagePreviews = useMemo(
    () =>
      editFiles.map((file) => ({
        name: file.name,
        isImage: file.type?.startsWith('image/'),
        url: file.type?.startsWith('image/') ? URL.createObjectURL(file) : null,
        size: Math.round(file.size / 1024),
      })),
    [editFiles],
  )

  const finishImagePreviews = useMemo(
    () =>
      finishFiles.filter((f) => f.type?.startsWith('image/')).map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        size: Math.round(file.size / 1024),
      })),
    [finishFiles],
  )

  useEffect(() => () => imagePreviews.forEach((item) => URL.revokeObjectURL(item.url)), [imagePreviews])
  useEffect(
    () => () => editImagePreviews.forEach((item) => item.url && URL.revokeObjectURL(item.url)),
    [editImagePreviews],
  )
  useEffect(() => () => finishImagePreviews.forEach((item) => URL.revokeObjectURL(item.url)), [finishImagePreviews])

  const getStatusBadge = (status) => {
    const map = {
      todo: 'bg-slate-100 text-slate-700',
      in_progress: 'bg-amber-100 text-amber-700',
      done: 'bg-emerald-100 text-emerald-700',
      cancelled: 'bg-rose-100 text-rose-700',
    }
    return map[status] || 'bg-slate-100 text-slate-700'
  }

  const formatDuration = (seconds) => {
    const safe = Number(seconds || 0)
    if (!safe || safe < 1) return '-'
    const hour = Math.floor(safe / 3600)
    const minute = Math.floor((safe % 3600) / 60)
    const sec = safe % 60
    return `${hour}j ${minute}m ${sec}d`
  }

  const getGoogleMapsLink = (latitude, longitude) => {
    if (latitude === null || longitude === null || latitude === undefined || longitude === undefined) return null
    return `https://maps.google.com/?q=${latitude},${longitude}`
  }

  const getCurrentLocation = (setter, sourceSetter) => {
    if (!navigator.geolocation) {
      toast.error('Browser tidak mendukung GPS')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setter({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        sourceSetter((prev) => ({ ...prev, location_source: 'gps' }))
        toast.success('Lokasi GPS berhasil diambil')
      },
      () => toast.error('Gagal mengambil lokasi GPS'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const canSalesEditTask = (task) => isSales && task.created_by_id === user?.id
  const canTechAct = (task) => isTech && task.user_id === user?.id

  const createTask = async (e) => {
    e.preventDefault()
    if (isSales && !selectedTechnician?.value) {
      toast.error('Pilih teknisi (pegawai) yang ditugaskan')
      return
    }
    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => formData.append(k, v ?? ''))
      if (isSales) formData.append('assigned_user_id', String(selectedTechnician.value))
      if (form.location_source === 'gps' && formLocation.latitude !== null && formLocation.longitude !== null) {
        formData.append('latitude', formLocation.latitude)
        formData.append('longitude', formLocation.longitude)
      }
      files.forEach((file) => formData.append('attachments', file))
      await client.post(ENDPOINTS.tasks, formData)
      toast.success('Tugas berhasil dibuat')
      setForm({ title: '', description: '', deadline_date: '', status: 'todo', location_source: 'manual', location_note: '' })
      setFormLocation({ latitude: null, longitude: null })
      setFiles([])
      setSelectedTechnician(null)
      setOpenCreateModal(false)
      fetchData(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal buat tugas')
    }
  }

  const openEditModal = (task) => {
    setEditTask(task)
    if (isTech) {
      setTechEditNote(task.work_progress_note || '')
      setEditFiles([])
      return
    }
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      deadline_date: task.deadline_date ? dayjs(task.deadline_date).format('YYYY-MM-DD') : '',
      status: task.status || 'todo',
      location_source: task.start_location_source || 'manual',
      location_note: task.start_location_note || '',
    })
    setEditLocation({
      latitude: task.start_latitude ?? null,
      longitude: task.start_longitude ?? null,
    })
    setEditFiles([])
  }

  const updateTask = async (e) => {
    e.preventDefault()
    if (!editTask) return
    try {
      if (isTech) {
        const formData = new FormData()
        formData.append('work_progress_note', techEditNote)
        editFiles.forEach((file) => formData.append('attachments', file))
        await client.put(`${ENDPOINTS.tasks}/${editTask.id}`, formData)
        toast.success('Catatan & lampiran pengerjaan tersimpan')
      } else {
        const formData = new FormData()
        Object.entries(editForm).forEach(([k, v]) => formData.append(k, v ?? ''))
        if (editForm.location_source === 'gps' && editLocation.latitude !== null && editLocation.longitude !== null) {
          formData.append('latitude', editLocation.latitude)
          formData.append('longitude', editLocation.longitude)
        }
        editFiles.forEach((file) => formData.append('attachments', file))
        await client.put(`${ENDPOINTS.tasks}/${editTask.id}`, formData)
        toast.success('Tugas berhasil diupdate')
      }
      setEditTask(null)
      setEditFiles([])
      fetchData(meta.page)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal update tugas')
    }
  }

  const submitStartTask = async (e) => {
    e.preventDefault()
    if (!startModalTask) return
    try {
      setTaskActionLoading(true)
      await client.post(`${ENDPOINTS.taskStart}/${startModalTask.id}/start`, {
        location_source: startForm.location_source,
        location_note: startForm.location_note || null,
        latitude: startForm.location_source === 'gps' ? startForm.latitude : null,
        longitude: startForm.location_source === 'gps' ? startForm.longitude : null,
      })
      toast.success('Pengerjaan dimulai')
      setStartModalTask(null)
      fetchData(meta.page)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal mulai tugas')
    } finally {
      setTaskActionLoading(false)
    }
  }

  const submitFinishTask = async (e) => {
    e.preventDefault()
    if (!finishModalTask) return
    const report = finishReport.trim()
    if (!report) {
      toast.error('Deskripsi / keterangan penyelesaian wajib diisi')
      return
    }
    const imageCount = finishFiles.filter((f) => f.type?.startsWith('image/')).length
    if (!imageCount) {
      toast.error('Minimal satu foto bukti penyelesaian wajib diupload')
      return
    }
    try {
      setTaskActionLoading(true)
      const formData = new FormData()
      formData.append('completion_report', report)
      formData.append('location_source', finishForm.location_source)
      formData.append('location_note', finishForm.location_note || '')
      if (finishForm.location_source === 'gps' && finishForm.latitude != null && finishForm.longitude != null) {
        formData.append('latitude', String(finishForm.latitude))
        formData.append('longitude', String(finishForm.longitude))
      }
      finishFiles.filter((f) => f.type?.startsWith('image/')).forEach((file) => formData.append('completion_attachments', file))
      await client.post(`${ENDPOINTS.taskStart}/${finishModalTask.id}/finish`, formData)
      toast.success('Pengerjaan selesai')
      setFinishModalTask(null)
      setFinishReport('')
      setFinishFiles([])
      setFinishForm({ location_source: 'manual', location_note: '', latitude: null, longitude: null })
      fetchData(meta.page)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal menyelesaikan tugas')
    } finally {
      setTaskActionLoading(false)
    }
  }

  const deleteTask = async (taskId) => {
    const toastId = toast.info(
      ({ closeToast }) => (
        <div className="space-y-2">
          <p className="text-sm font-medium">Yakin ingin menghapus tugas ini? Semua attachment akan ikut terhapus.</p>
          <div className="flex gap-2">
            <button
              className="btn bg-rose-600 text-white hover:opacity-90"
              onClick={async () => {
                try {
                  await client.delete(`${ENDPOINTS.tasks}/${taskId}`)
                  toast.success('Tugas berhasil dihapus')
                  if (editTask?.id === taskId) setEditTask(null)
                  fetchData(1)
                } catch (error) {
                  toast.error(error.response?.data?.message || 'Gagal hapus tugas')
                } finally {
                  closeToast()
                }
              }}
            >
              Ya, Hapus
            </button>
            <button className="btn border border-slate-200" onClick={closeToast}>
              Batal
            </button>
          </div>
        </div>
      ),
      {
        autoClose: false,
        closeOnClick: false,
      },
    )

    return toastId
  }

  const deleteOldAttachment = async (attachmentId) => {
    if (!editTask) return
    try {
      await client.delete(`${ENDPOINTS.tasks}/${editTask.id}/attachments/${attachmentId}`)
      toast.success('Attachment lama berhasil dihapus')
      setEditTask((prev) => ({
        ...prev,
        attachments: prev.attachments.filter((att) => att.id !== attachmentId),
      }))
      setRows((prev) =>
        prev.map((task) =>
          task.id === editTask.id ? { ...task, attachments: task.attachments.filter((att) => att.id !== attachmentId) } : task,
        ),
      )
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal hapus attachment')
    }
  }

  const pageTitle = isSales ? 'Tugas untuk Teknisi' : 'Tugas Saya'

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{pageTitle}</h2>
          {isSales && (
            <button className="btn-primary" onClick={() => setOpenCreateModal(true)}>
              + Buat Tugas
            </button>
          )}
        </div>
        {isSales && <p className="mt-2 text-sm text-slate-600">Buat tugas baru dan pilih teknisi (pegawai) yang akan mengerjakan di lapangan.</p>}
        {isTech && <p className="mt-2 text-sm text-slate-600">Mulai pengerjaan di lapangan. Sebelum menyelesaikan tugas wajib upload minimal satu foto dan isi keterangan penyelesaian.</p>}
      </div>

      <div className="card">
        <div className="mb-3 flex gap-2">
          <input className="input" placeholder="Search by API..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn border border-slate-200" onClick={() => fetchData(1, debouncedSearch)}>
            Cari
          </button>
        </div>
        <div className="space-y-3">
          {rows.map((task) => (
            <div key={task.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{task.title}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn inline-flex items-center gap-1 bg-slate-700 text-white hover:opacity-90" onClick={() => setDetailTask(task)}>
                    <Search size={14} /> Detail
                  </button>
                  {(canTechAct(task) || canSalesEditTask(task)) && (
                    <>
                      <button type="button" className="btn inline-flex items-center gap-1 bg-[#11295a] text-white hover:opacity-90" onClick={() => openEditModal(task)}>
                        <Pencil size={14} /> {isTech ? 'Progres' : 'Edit'}
                      </button>
                      <button type="button" className="btn inline-flex items-center gap-1 bg-rose-600 text-white hover:opacity-90" onClick={() => deleteTask(task.id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs font-medium text-slate-500">
                Teknisi: {task.user_name}
                {task.created_by_name ? ` · Dari sales: ${task.created_by_name}` : ''}
              </p>
              <p className="text-sm text-slate-600">{task.description || '-'}</p>
              {isTech && task.work_progress_note ? (
                <p className="mt-1 text-xs text-slate-600">
                  <span className="font-medium">Catatan pengerjaan: </span>
                  {task.work_progress_note}
                </p>
              ) : null}
              <p className="text-xs text-slate-500">Deadline: {task.deadline_date ? dayjs(task.deadline_date).format('DD MMM YYYY') : '-'}</p>
              <p className="text-xs text-slate-500">
                Mulai: {task.started_at ? dayjs(task.started_at).format('DD MMM YYYY HH:mm') : '-'} | Selesai: {task.completed_at ? dayjs(task.completed_at).format('DD MMM YYYY HH:mm') : '-'}
              </p>
              <p className="text-xs text-slate-500">Durasi kerja: {formatDuration(task.work_duration_seconds)}</p>
              <div className="mt-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(task.status)}`}>{task.status}</span>
              </div>
              {canTechAct(task) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={taskActionLoading || !!task.started_at || !!task.completed_at}
                    className="btn inline-flex items-center gap-1 bg-amber-600 text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      setStartForm({ location_source: 'manual', location_note: '', latitude: null, longitude: null })
                      setStartModalTask(task)
                    }}
                  >
                    <PlayCircle size={14} /> Mulai Pengerjaan
                  </button>
                  <button
                    type="button"
                    disabled={taskActionLoading || !task.started_at || !!task.completed_at}
                    className="btn inline-flex items-center gap-1 bg-emerald-600 text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      setFinishReport('')
                      setFinishFiles([])
                      setFinishForm({ location_source: 'manual', location_note: '', latitude: null, longitude: null })
                      setFinishModalTask(task)
                    }}
                  >
                    <CheckCircle2 size={14} /> Selesai Pengerjaan
                  </button>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {task.attachments?.map((att) => (
                  <a key={att.id} target="_blank" className="text-xs text-blue-600 underline" href={`https://api-inventory.isavralabel.com/my-sicepat/uploads-my-sicepat/${att.stored_name}`} rel="noreferrer">
                    {att.is_completion ? `${att.original_name} (bukti selesai)` : att.original_name}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Pagination {...meta} onChange={fetchData} />
      </div>

      <Modal open={Boolean(startModalTask)} title="Mulai Pengerjaan" onClose={() => setStartModalTask(null)} maxWidth="max-w-lg">
        <form onSubmit={submitStartTask} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Lokasi</label>
            <select className="input" value={startForm.location_source} onChange={(e) => setStartForm({ ...startForm, location_source: e.target.value })}>
              <option value="manual">Manual</option>
              <option value="gps">GPS</option>
            </select>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Catatan lokasi</label>
              <input className="input" value={startForm.location_note} onChange={(e) => setStartForm({ ...startForm, location_note: e.target.value })} />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn w-full border border-slate-200"
                onClick={() =>
                  getCurrentLocation(
                    (coords) => setStartForm((prev) => ({ ...prev, ...coords })),
                    setStartForm,
                  )
                }
              >
                Ambil GPS
              </button>
            </div>
          </div>
          <button disabled={taskActionLoading} className="btn-primary w-full">
            Mulai
          </button>
        </form>
      </Modal>

      <Modal open={Boolean(finishModalTask)} title="Selesai Pengerjaan" onClose={() => !taskActionLoading && setFinishModalTask(null)} maxWidth="max-w-4xl">
        <form onSubmit={submitFinishTask} className="space-y-4">
          <p className="text-sm text-slate-600">Wajib isi keterangan penyelesaian dan minimal satu foto bukti pekerjaan selesai.</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi / keterangan penyelesaian *</label>
            <textarea className="input min-h-[100px]" value={finishReport} onChange={(e) => setFinishReport(e.target.value)} placeholder="Contoh: Instalasi selesai, kabel dirapikan, speed test OK." required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Foto bukti selesai *</label>
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" className="btn border border-slate-200" onClick={() => cameraFinishRef.current?.click()}>
                Camera
              </button>
              <button type="button" className="btn border border-slate-200" onClick={() => galleryFinishRef.current?.click()}>
                Gallery
              </button>
              <input ref={cameraFinishRef} className="hidden" type="file" accept="image/*" capture="environment" multiple onChange={(e) => handleFinishFiles(e.target.files)} />
              <input ref={galleryFinishRef} className="hidden" type="file" accept="image/*" multiple onChange={(e) => handleFinishFiles(e.target.files)} />
            </div>
          </div>
          {!!finishImagePreviews.length && (
            <div className="grid gap-2 md:grid-cols-3">
              {finishImagePreviews.map((item) => (
                <div key={item.url} className="rounded-lg border border-slate-200 p-1">
                  <img src={item.url} alt={item.name} className="h-24 w-full rounded object-cover" />
                  <p className="truncate px-1 text-xs text-slate-600">{item.name}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Lokasi selesai</label>
              <select className="input" value={finishForm.location_source} onChange={(e) => setFinishForm({ ...finishForm, location_source: e.target.value })}>
                <option value="manual">Manual</option>
                <option value="gps">GPS</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn w-full border border-slate-200"
                onClick={() =>
                  getCurrentLocation(
                    (coords) => setFinishForm((prev) => ({ ...prev, ...coords })),
                    setFinishForm,
                  )
                }
              >
                Ambil GPS
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Catatan lokasi</label>
            <input className="input" value={finishForm.location_note} onChange={(e) => setFinishForm({ ...finishForm, location_note: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={taskActionLoading} type="button" className="btn border border-slate-200" onClick={() => setFinishFiles([])}>
              Hapus foto terpilih
            </button>
            <button disabled={taskActionLoading} className="btn bg-emerald-600 text-white hover:opacity-90">
              Selesai & simpan
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(detailTask)} title="Detail Tugas" onClose={() => setDetailTask(null)} maxWidth="max-w-4xl">
        {detailTask && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">{detailTask.title}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(detailTask.status)}`}>{detailTask.status}</span>
            </div>
            <p className="text-sm text-slate-600">
              Teknisi: {detailTask.user_name}
              {detailTask.created_by_name ? ` · Sales: ${detailTask.created_by_name}` : ''}
            </p>
            <p className="text-sm text-slate-600">{detailTask.description || '-'}</p>
            {detailTask.work_progress_note ? (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Catatan pengerjaan teknisi: </span>
                {detailTask.work_progress_note}
              </p>
            ) : null}
            {detailTask.completion_report ? (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Laporan penyelesaian: </span>
                {detailTask.completion_report}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">Durasi kerja: {formatDuration(detailTask.work_duration_seconds)}</p>
            <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-2">
              <div>
                Lokasi mulai: {detailTask.start_location_source || '-'} {detailTask.start_location_note ? `| ${detailTask.start_location_note}` : ''}
              </div>
              <div>
                Lokasi selesai: {detailTask.completion_location_source || '-'} {detailTask.completion_location_note ? `| ${detailTask.completion_location_note}` : ''}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {getGoogleMapsLink(detailTask.start_latitude, detailTask.start_longitude) && (
                <a href={getGoogleMapsLink(detailTask.start_latitude, detailTask.start_longitude)} target="_blank" rel="noreferrer" className="btn inline-flex items-center gap-1 bg-indigo-600 text-white hover:opacity-90">
                  <MapPin size={14} /> Maps Mulai
                </a>
              )}
              {getGoogleMapsLink(detailTask.completion_latitude, detailTask.completion_longitude) && (
                <a href={getGoogleMapsLink(detailTask.completion_latitude, detailTask.completion_longitude)} target="_blank" rel="noreferrer" className="btn inline-flex items-center gap-1 bg-indigo-600 text-white hover:opacity-90">
                  <MapPin size={14} /> Maps Selesai
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(editTask) && !isTech} title="Edit Tugas" onClose={() => setEditTask(null)} maxWidth="max-w-4xl">
        {editTask && !isTech && (
          <form onSubmit={updateTask} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Judul Tugas</label>
              <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi</label>
              <textarea className="input" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Deadline</label>
                <input className="input" type="date" value={editForm.deadline_date} onChange={(e) => setEditForm({ ...editForm, deadline_date: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  {statusOptions.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Lokasi</label>
              <select className="input" value={editForm.location_source} onChange={(e) => setEditForm({ ...editForm, location_source: e.target.value })}>
                <option value="manual">Manual</option>
                <option value="gps">GPS</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Catatan Lokasi</label>
                <input className="input" value={editForm.location_note} onChange={(e) => setEditForm({ ...editForm, location_note: e.target.value })} placeholder="Contoh: Gudang Jakarta Barat" />
              </div>
              <div className="flex items-end">
                <button type="button" className="btn w-full border border-slate-200" onClick={() => getCurrentLocation(setEditLocation, setEditForm)}>
                  Ambil GPS
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tambah Attachment Baru</label>
              <div className="mb-2 flex flex-wrap gap-2">
                <button type="button" className="btn border border-slate-200" onClick={() => cameraEditRef.current?.click()}>
                  Camera
                </button>
                <button type="button" className="btn border border-slate-200" onClick={() => galleryEditRef.current?.click()}>
                  Gallery
                </button>
                <button type="button" className="btn border border-slate-200" onClick={() => fileEditRef.current?.click()}>
                  File/PC
                </button>
                <input ref={cameraEditRef} className="hidden" type="file" accept="image/*" capture="environment" multiple onChange={(e) => handleEditFiles(e.target.files)} />
                <input ref={galleryEditRef} className="hidden" type="file" accept="image/*" multiple onChange={(e) => handleEditFiles(e.target.files)} />
                <input ref={fileEditRef} className="hidden" type="file" multiple onChange={(e) => handleEditFiles(e.target.files)} />
              </div>
              <label
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${editDragActive ? 'border-brand-red bg-red-50' : 'border-slate-200 bg-slate-50 hover:border-brand-red/60'}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setEditDragActive(true)
                }}
                onDragLeave={() => setEditDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setEditDragActive(false)
                  handleEditFiles(e.dataTransfer.files)
                }}
              >
                <input className="hidden" type="file" multiple onChange={(e) => handleEditFiles(e.target.files)} />
                <ImagePlus size={26} className="mb-2 text-slate-500" />
                <p className="text-sm font-medium text-slate-700">Klik atau drag-drop file baru</p>
              </label>
            </div>
            {!!editTask?.attachments?.length && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Attachment Lama</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {editTask.attachments.map((att) => (
                    <div key={att.id} className="rounded-xl border border-slate-200 bg-white p-2">
                      {att.mime_type?.startsWith('image/') ? (
                        <img src={`https://api-inventory.isavralabel.com/my-sicepat/uploads-my-sicepat/${att.stored_name}`} alt={att.original_name} className="h-28 w-full rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-28 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                          <FileText size={26} />
                        </div>
                      )}
                      <p className="mt-2 truncate text-xs font-medium text-slate-700">{att.original_name}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <a
                          target="_blank"
                          className="btn inline-flex items-center gap-1 bg-[#11295a] text-xs text-white hover:opacity-90"
                          href={`https://api-inventory.isavralabel.com/my-sicepat/uploads-my-sicepat/${att.stored_name}`}
                          rel="noreferrer"
                        >
                          {att.mime_type?.startsWith('image/') ? <ImageIcon size={13} /> : <FileText size={13} />}
                          Lihat
                        </a>
                        <button type="button" className="btn inline-flex items-center gap-1 bg-rose-600 text-xs text-white hover:opacity-90" onClick={() => deleteOldAttachment(att.id)}>
                          <Trash2 size={13} /> Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!!editImagePreviews.length && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Preview Attachment Baru</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {editImagePreviews.map((item) => (
                    <div key={`${item.name}-${item.size}`} className="rounded-xl border border-slate-200 bg-white p-2">
                      {item.isImage && item.url ? (
                        <img src={item.url} alt={item.name} className="h-28 w-full rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-28 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                          <FileText size={26} />
                        </div>
                      )}
                      <p className="mt-2 truncate text-xs font-medium text-slate-700">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.size} KB</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn bg-[#11295a] text-white hover:opacity-90">Update Tugas</button>
              <button type="button" className="btn inline-flex items-center gap-1 bg-rose-600 text-white hover:opacity-90" onClick={() => deleteTask(editTask.id)}>
                <Trash2 size={14} /> Delete Tugas
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(editTask) && isTech} title="Progres pengerjaan" onClose={() => setEditTask(null)} maxWidth="max-w-4xl">
        {editTask && isTech && (
          <form onSubmit={updateTask} className="space-y-4">
            <p className="text-sm text-slate-600">Tambahkan catatan dan foto dokumentasi saat mengerjakan tugas.</p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Catatan / deskripsi pengerjaan</label>
              <textarea className="input min-h-[120px]" value={techEditNote} onChange={(e) => setTechEditNote(e.target.value)} placeholder="Contoh: Sudah cek ONT, ganti kabel patchcore." />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Lampiran foto</label>
              <div className="mb-2 flex flex-wrap gap-2">
                <button type="button" className="btn border border-slate-200" onClick={() => cameraEditRef.current?.click()}>
                  Camera
                </button>
                <button type="button" className="btn border border-slate-200" onClick={() => galleryEditRef.current?.click()}>
                  Gallery
                </button>
                <button type="button" className="btn border border-slate-200" onClick={() => fileEditRef.current?.click()}>
                  File/PC
                </button>
                <input ref={cameraEditRef} className="hidden" type="file" accept="image/*" capture="environment" multiple onChange={(e) => handleEditFiles(e.target.files)} />
                <input ref={galleryEditRef} className="hidden" type="file" accept="image/*" multiple onChange={(e) => handleEditFiles(e.target.files)} />
                <input ref={fileEditRef} className="hidden" type="file" accept="image/*" multiple onChange={(e) => handleEditFiles(e.target.files)} />
              </div>
            </div>
            {!!editImagePreviews.length && (
              <div className="grid gap-3 md:grid-cols-3">
                {editImagePreviews.map((item) => (
                  <div key={`${item.name}-${item.size}`} className="rounded-xl border border-slate-200 bg-white p-2">
                    {item.isImage && item.url ? (
                      <img src={item.url} alt={item.name} className="h-28 w-full rounded-lg object-cover" />
                    ) : null}
                    <p className="mt-2 truncate text-xs font-medium text-slate-700">{item.name}</p>
                  </div>
                ))}
              </div>
            )}
            {!!editTask?.attachments?.length && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Lampiran saat ini</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {editTask.attachments.map((att) => (
                    <div key={att.id} className="rounded-xl border border-slate-200 bg-white p-2">
                      {att.mime_type?.startsWith('image/') ? (
                        <img src={`https://api-inventory.isavralabel.com/my-sicepat/uploads-my-sicepat/${att.stored_name}`} alt={att.original_name} className="h-28 w-full rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-28 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                          <FileText size={26} />
                        </div>
                      )}
                      <div className="mt-2 flex gap-2">
                        <a className="btn bg-[#11295a] text-xs text-white" target="_blank" href={`https://api-inventory.isavralabel.com/my-sicepat/uploads-my-sicepat/${att.stored_name}`} rel="noreferrer">
                          Buka
                        </a>
                        <button type="button" className="btn bg-rose-600 text-xs text-white" onClick={() => deleteOldAttachment(att.id)}>
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button className="btn bg-[#11295a] text-white hover:opacity-90">Simpan progres</button>
          </form>
        )}
      </Modal>

      <Modal open={openCreateModal} title="Buat tugas untuk teknisi" onClose={() => setOpenCreateModal(false)} maxWidth="max-w-4xl">
        <form onSubmit={createTask} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Teknisi (pegawai) *</label>
            <AsyncSelect placeholder="Cari nama teknisi..." value={selectedTechnician} onChange={setSelectedTechnician} loadOptions={loadTechnicians} defaultOptions cacheOptions />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Judul Tugas</label>
            <input className="input" placeholder="Contoh: Instalasi internet rumah pelanggan" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi</label>
            <textarea className="input" placeholder="Alamat / detail pekerjaan..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Deadline</label>
              <input className="input" type="date" value={form.deadline_date} onChange={(e) => setForm({ ...form, deadline_date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Status awal</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {statusOptions.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Lokasi (opsional)</label>
            <select className="input" value={form.location_source} onChange={(e) => setForm({ ...form, location_source: e.target.value })}>
              <option value="manual">Manual</option>
              <option value="gps">GPS</option>
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Catatan Lokasi</label>
              <input className="input" placeholder="Contoh: Area Cengkareng" value={form.location_note} onChange={(e) => setForm({ ...form, location_note: e.target.value })} />
            </div>
            <div className="flex items-end">
              <button type="button" className="btn w-full border border-slate-200" onClick={() => getCurrentLocation((coords) => setFormLocation(coords), setForm)}>
                Ambil GPS
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Lampiran awal (opsional)</label>
            <div className="mb-2 flex flex-wrap gap-2">
              <button type="button" className="btn border border-slate-200" onClick={() => cameraCreateRef.current?.click()}>
                Camera
              </button>
              <button type="button" className="btn border border-slate-200" onClick={() => galleryCreateRef.current?.click()}>
                Gallery
              </button>
              <button type="button" className="btn border border-slate-200" onClick={() => fileCreateRef.current?.click()}>
                File/PC
              </button>
              <input ref={cameraCreateRef} className="hidden" type="file" accept="image/*" capture="environment" multiple onChange={(e) => handleFiles(e.target.files)} />
              <input ref={galleryCreateRef} className="hidden" type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} />
              <input ref={fileCreateRef} className="hidden" type="file" multiple onChange={(e) => handleFiles(e.target.files)} />
            </div>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${dragActive ? 'border-brand-red bg-red-50' : 'border-slate-200 bg-slate-50 hover:border-brand-red/60'}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                handleFiles(e.dataTransfer.files)
              }}
            >
              <input className="hidden" type="file" multiple onChange={(e) => handleFiles(e.target.files)} />
              <ImagePlus size={30} className="mb-2 text-slate-500" />
              <p className="text-sm font-medium text-slate-700">Klik untuk upload atau drag & drop file</p>
            </label>
          </div>
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Preview ({imagePreviews.length})</p>
              <div className="grid gap-3 md:grid-cols-3">
                {imagePreviews.map((item) => (
                  <div key={item.url} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <img src={item.url} alt={item.name} className="h-36 w-full object-cover" />
                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-slate-700">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.size} KB</p>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn inline-flex items-center gap-1 border border-rose-200 text-rose-600" onClick={() => setFiles([])}>
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
