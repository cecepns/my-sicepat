import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'
import Pagination from '../../components/common/Pagination'
import Modal from '../../components/common/Modal'
import useDebounce from '../../hooks/useDebounce'

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0 })
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' })
  const [openCreateModal, setOpenCreateModal] = useState(false)
  const [openEditModal, setOpenEditModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', role: 'user', is_active: 1 })
  const debouncedSearch = useDebounce(search, 1000)

  const fetchUsers = useCallback(async (page = 1, keyword = debouncedSearch) => {
    const { data } = await client.get(ENDPOINTS.users, { params: { page, limit: 10, search: keyword } })
    setRows(data.data)
    setMeta({ page: data.page, limit: data.limit, total: data.total })
  }, [debouncedSearch])
  useEffect(() => {
    fetchUsers(1)
  }, [fetchUsers])

  const submit = async (e) => {
    e.preventDefault()
    try {
      await client.post(ENDPOINTS.users, form)
      toast.success('User berhasil ditambah')
      setForm({ name: '', email: '', password: '', role: 'user' })
      setOpenCreateModal(false)
      fetchUsers(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal tambah user')
    }
  }

  const openEdit = (row) => {
    setEditId(row.id)
    setEditForm({
      name: row.name,
      email: row.email,
      password: '',
      role: row.role,
      is_active: row.is_active ? 1 : 0,
    })
    setOpenEditModal(true)
  }

  const submitEdit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        is_active: Number(editForm.is_active),
      }
      if (editForm.password) payload.password = editForm.password
      await client.put(`${ENDPOINTS.users}/${editId}`, payload)
      toast.success('User berhasil diupdate')
      setOpenEditModal(false)
      setEditId(null)
      fetchUsers(meta.page)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal update user')
    }
  }

  const deleteUser = async (id) => {
    if (!window.confirm('Yakin ingin hapus user ini?')) return
    try {
      await client.delete(`${ENDPOINTS.users}/${id}`)
      toast.success('User berhasil dihapus')
      fetchUsers(1)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal hapus user')
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Manajemen User</h2>
          <button className="btn-primary" onClick={() => setOpenCreateModal(true)}>
            + Tambah User
          </button>
        </div>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input className="input sm:max-w-lg" placeholder="Search users by API..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn bg-[#11295a] text-white hover:opacity-90" onClick={() => fetchUsers(1, debouncedSearch)}>
            Cari
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-700">{row.name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        row.role === 'admin'
                          ? 'bg-indigo-100 text-indigo-700'
                          : row.role === 'sales'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {row.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {row.is_active ? 'aktif' : 'nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="btn inline-flex items-center gap-1 bg-[#11295a] text-white hover:opacity-90" onClick={() => openEdit(row)}>
                        <Pencil size={14} /> Edit
                      </button>
                      <button className="btn inline-flex items-center gap-1 bg-rose-600 text-white hover:opacity-90" onClick={() => deleteUser(row.id)}>
                        <Trash2 size={14} /> Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination {...meta} onChange={fetchUsers} />
      </div>

      <Modal open={openCreateModal} title="Tambah User Baru" onClose={() => setOpenCreateModal(false)} maxWidth="max-w-3xl">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="input" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="user">user (teknisi/pegawai)</option>
            <option value="sales">sales</option>
            <option value="admin">admin</option>
          </select>
          <div className="md:col-span-2">
            <button className="btn-primary">Simpan User</button>
          </div>
        </form>
      </Modal>

      <Modal open={openEditModal} title="Edit User" onClose={() => setOpenEditModal(false)} maxWidth="max-w-3xl">
        <form onSubmit={submitEdit} className="grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="Nama" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          <input className="input" type="email" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
          <input className="input" type="password" placeholder="Password baru (opsional)" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
          <select className="input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
            <option value="user">user (teknisi/pegawai)</option>
            <option value="sales">sales</option>
            <option value="admin">admin</option>
          </select>
          <select className="input md:col-span-2" value={editForm.is_active} onChange={(e) => setEditForm({ ...editForm, is_active: Number(e.target.value) })}>
            <option value={1}>aktif</option>
            <option value={0}>nonaktif</option>
          </select>
          <div className="md:col-span-2">
            <button className="btn-primary">Update User</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
