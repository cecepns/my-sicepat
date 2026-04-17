import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Pagination from '../../components/common/Pagination'
import Modal from '../../components/common/Modal'
import useDebounce from '../../hooks/useDebounce'

const emptyForm = {
  name: '',
  phone: '',
  address: '',
  status: 'active',
  customer_code: '',
  customer_password: '',
  photo_file: null,
  photo_url: '',
  remove_photo: false,
}

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 })
  const [openCreate, setOpenCreate] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const debouncedSearch = useDebounce(search, 600)

  const fetchData = useCallback(
    async (page = 1) => {
      const { data } = await client.get(ENDPOINTS.customers, {
        params: { page, limit: 10, search: debouncedSearch, status: statusFilter || undefined },
      })
      setRows(data.data)
      setMeta({ page: data.page, limit: data.limit, total: data.total })
    },
    [debouncedSearch, statusFilter],
  )

  useEffect(() => {
    fetchData(1)
  }, [fetchData])

  const submitCreate = async (e) => {
    e.preventDefault()
    try {
      const payload = new FormData()
      payload.append('name', form.name)
      payload.append('phone', form.phone)
      payload.append('address', form.address)
      payload.append('status', form.status)
      payload.append('customer_code', form.customer_code || '')
      payload.append('customer_password', form.customer_password || '')
      if (form.photo_file) payload.append('photo', form.photo_file)
      await client.post(ENDPOINTS.customers, payload, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Pelanggan berhasil ditambah')
      setForm(emptyForm)
      setOpenCreate(false)
      fetchData(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal menambah pelanggan')
    }
  }

  const openEditModal = (row) => {
    setEditId(row.id)
    setForm({
      name: row.name,
      phone: row.phone,
      address: row.address,
      status: row.status === 'inactive' ? 'inactive' : 'active',
      customer_code: row.customer_code || '',
      customer_password: row.customer_password || '',
      photo_file: null,
      photo_url: row.photo_url || '',
      remove_photo: false,
    })
    setOpenEdit(true)
  }

  const submitEdit = async (e) => {
    e.preventDefault()
    try {
      const payload = new FormData()
      payload.append('name', form.name)
      payload.append('phone', form.phone)
      payload.append('address', form.address)
      payload.append('status', form.status)
      payload.append('customer_code', form.customer_code || '')
      payload.append('customer_password', form.customer_password || '')
      if (form.photo_file) payload.append('photo', form.photo_file)
      payload.append('keep_existing_photo', form.remove_photo ? '0' : '1')
      await client.put(`${ENDPOINTS.customers}/${editId}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Pelanggan berhasil diupdate')
      setOpenEdit(false)
      setEditId(null)
      setForm(emptyForm)
      fetchData(meta.page)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal update pelanggan')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin hapus pelanggan ini?')) return
    try {
      await client.delete(`${ENDPOINTS.customers}/${id}`)
      toast.success('Pelanggan berhasil dihapus')
      fetchData(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal hapus pelanggan')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Manajemen Pelanggan</h2>
          <button
            className="btn-primary"
            onClick={() => {
              setForm(emptyForm)
              setOpenCreate(true)
            }}
          >
            + Tambah Pelanggan
          </button>
        </div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <input
            className="input sm:max-w-md"
            placeholder="Cari nama, telepon, alamat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <button className="btn bg-[#11295a] text-white hover:opacity-90" onClick={() => fetchData(1)}>
            Terapkan
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Foto</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Telepon</th>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">PW Mikrotik</th>
                <th className="px-4 py-3">Alamat</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    {row.photo_url ? (
                      <img src={row.photo_url} alt={row.name} className="h-10 w-10 rounded-lg border border-slate-200 object-cover" />
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{row.name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{row.customer_code || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.customer_password || '-'}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600" title={row.address}>
                    {row.address}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        row.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {row.status === 'active' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" className="btn border border-slate-200 p-2" title="Edit" onClick={() => openEditModal(row)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" className="btn border border-rose-200 p-2 text-rose-600" title="Hapus" onClick={() => handleDelete(row.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...meta} onChange={fetchData} />
      </div>

      <Modal open={openCreate} title="Tambah Pelanggan" onClose={() => setOpenCreate(false)}>
        <form onSubmit={submitCreate} className="grid gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nomor telepon</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kode Pelanggan (Mikrotik)</label>
            <input className="input" value={form.customer_code} onChange={(e) => setForm({ ...form, customer_code: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password Pelanggan (Mikrotik)</label>
            <input className="input" value={form.customer_password} onChange={(e) => setForm({ ...form, customer_password: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Alamat</label>
            <textarea className="input min-h-[88px]" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Foto Pelanggan</label>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setForm({ ...form, photo_file: e.target.files?.[0] || null })}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
          <button className="btn-primary max-w-fit">Simpan</button>
        </form>
      </Modal>

      <Modal
        open={openEdit}
        title="Edit Pelanggan"
        onClose={() => {
          setOpenEdit(false)
          setEditId(null)
          setForm(emptyForm)
        }}
      >
        <form onSubmit={submitEdit} className="grid gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nomor telepon</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kode Pelanggan (Mikrotik)</label>
            <input className="input" value={form.customer_code} onChange={(e) => setForm({ ...form, customer_code: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password Pelanggan (Mikrotik)</label>
            <input className="input" value={form.customer_password} onChange={(e) => setForm({ ...form, customer_password: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Alamat</label>
            <textarea className="input min-h-[88px]" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Foto Pelanggan</label>
            {form.photo_url && !form.remove_photo ? (
              <img src={form.photo_url} alt={form.name} className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />
            ) : null}
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setForm({ ...form, photo_file: e.target.files?.[0] || null })}
            />
            {form.photo_url ? (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={form.remove_photo}
                  onChange={(e) => setForm({ ...form, remove_photo: e.target.checked })}
                />
                Hapus foto lama saat update
              </label>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </div>
          <button className="btn-primary max-w-fit">Update</button>
        </form>
      </Modal>
    </div>
  )
}
