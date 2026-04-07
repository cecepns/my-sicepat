import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'

export default function AdminSettingsPage() {
  const [form, setForm] = useState({ check_in_time: '08:00:00', check_out_time: '17:00:00', default_task_max_claimants: 2, late_penalty_per_point_rupiah: 10000 })
  const [offices, setOffices] = useState([])
  const [officeForm, setOfficeForm] = useState({ name: '', latitude: '', longitude: '', radius_meter: 300 })
  const [editingOfficeId, setEditingOfficeId] = useState(null)
  const [gettingLocation, setGettingLocation] = useState(false)

  const fetchOffices = async () => {
    const { data } = await client.get(ENDPOINTS.offices)
    setOffices(data || [])
  }

  useEffect(() => {
    const run = async () => {
      const [settingsRes] = await Promise.all([client.get(ENDPOINTS.settings), fetchOffices()])
      if (settingsRes.data) setForm(settingsRes.data)
    }
    run()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    try {
      await client.put(ENDPOINTS.settings, form)
      toast.success('Settings berhasil disimpan')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal simpan settings')
    }
  }

  const getOfficeLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Browser tidak mendukung geolocation')
      return
    }
    setGettingLocation(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setOfficeForm((prev) => ({
          ...prev,
          latitude: Number(coords.latitude).toFixed(7),
          longitude: Number(coords.longitude).toFixed(7),
        }))
        toast.success('Lokasi kantor berhasil didapatkan')
        setGettingLocation(false)
      },
      (error) => {
        toast.error(error.message || 'Gagal mendapatkan lokasi')
        setGettingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  const submitOffice = async (e) => {
    e.preventDefault()
    const payload = {
      name: officeForm.name,
      latitude: Number(officeForm.latitude),
      longitude: Number(officeForm.longitude),
      radius_meter: Number(officeForm.radius_meter || 300),
    }
    if (!payload.name?.trim()) {
      toast.error('Nama kantor wajib diisi')
      return
    }
    if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
      toast.error('Latitude / longitude kantor tidak valid')
      return
    }
    try {
      if (editingOfficeId) {
        await client.put(`${ENDPOINTS.offices}/${editingOfficeId}`, payload)
        toast.success('Kantor berhasil diupdate')
      } else {
        await client.post(ENDPOINTS.offices, payload)
        toast.success('Kantor berhasil ditambah')
      }
      setEditingOfficeId(null)
      setOfficeForm({ name: '', latitude: '', longitude: '', radius_meter: 300 })
      fetchOffices()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal simpan kantor')
    }
  }

  const editOffice = (row) => {
    setEditingOfficeId(row.id)
    setOfficeForm({
      name: row.name || '',
      latitude: row.latitude ?? '',
      longitude: row.longitude ?? '',
      radius_meter: row.radius_meter ?? 300,
    })
  }

  const deleteOffice = async (id) => {
    if (!window.confirm('Hapus kantor ini?')) return
    try {
      await client.delete(`${ENDPOINTS.offices}/${id}`)
      toast.success('Kantor berhasil dihapus')
      fetchOffices()
      if (editingOfficeId === id) {
        setEditingOfficeId(null)
        setOfficeForm({ name: '', latitude: '', longitude: '', radius_meter: 300 })
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Gagal hapus kantor')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card grid gap-4 md:grid-cols-2">
        <h2 className="md:col-span-2 text-lg font-semibold">Pengaturan Absensi Umum</h2>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Jam Masuk</label>
          <input className="input" type="time" value={(form.check_in_time || '').slice(0, 5)} onChange={(e) => setForm({ ...form, check_in_time: `${e.target.value}:00` })} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Jam Pulang</label>
          <input className="input" type="time" value={(form.check_out_time || '').slice(0, 5)} onChange={(e) => setForm({ ...form, check_out_time: `${e.target.value}:00` })} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Maks Teknisi per Tugas All Teknisi</label>
          <input
            className="input"
            type="number"
            min={1}
            value={form.default_task_max_claimants || 2}
            onChange={(e) => setForm({ ...form, default_task_max_claimants: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nominal potongan per poin telat (Rp)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={form.late_penalty_per_point_rupiah ?? 10000}
            onChange={(e) => setForm({ ...form, late_penalty_per_point_rupiah: e.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500">Digunakan untuk estimasi potongan di laporan poin telat (1 poin = telat ≤ 1 jam, 2 poin = telat &gt; 1 jam).</p>
        </div>
        <button className="btn-primary md:col-span-2 max-w-fit">Simpan Settings</button>
      </form>

      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Daftar Kantor Absensi</h2>
        <form onSubmit={submitOffice} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama Kantor</label>
            <input className="input" placeholder="Contoh: Kantor Pusat" value={officeForm.name} onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Radius Kantor (meter)</label>
            <input className="input" type="number" min={1} value={officeForm.radius_meter} onChange={(e) => setOfficeForm({ ...officeForm, radius_meter: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Latitude Kantor</label>
            <input className="input" placeholder="-6.2000000" value={officeForm.latitude} onChange={(e) => setOfficeForm({ ...officeForm, latitude: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Longitude Kantor</label>
            <input className="input" placeholder="106.8166667" value={officeForm.longitude} onChange={(e) => setOfficeForm({ ...officeForm, longitude: e.target.value })} />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button type="button" className="btn bg-[#11295a] text-white hover:opacity-90" onClick={getOfficeLocation} disabled={gettingLocation}>
              {gettingLocation ? 'Mengambil lokasi...' : 'Ambil Lokasi via GPS'}
            </button>
            {editingOfficeId ? (
              <button
                type="button"
                className="btn border border-slate-200"
                onClick={() => {
                  setEditingOfficeId(null)
                  setOfficeForm({ name: '', latitude: '', longitude: '', radius_meter: 300 })
                }}
              >
                Batal Edit
              </button>
            ) : null}
          </div>
          <button className="btn-primary md:col-span-2 max-w-fit">{editingOfficeId ? 'Update Kantor' : 'Tambah Kantor'}</button>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Latitude</th>
                <th className="px-4 py-3">Longitude</th>
                <th className="px-4 py-3">Radius (m)</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offices.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-700">{row.name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.latitude}</td>
                  <td className="px-4 py-3 text-slate-600">{row.longitude}</td>
                  <td className="px-4 py-3 text-slate-600">{row.radius_meter}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" className="btn bg-amber-500 text-white hover:opacity-90" onClick={() => editOffice(row)}>
                        Edit
                      </button>
                      <button type="button" className="btn bg-rose-600 text-white hover:opacity-90" onClick={() => deleteOffice(row.id)}>
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!offices.length ? (
                <tr>
                  <td className="px-4 py-3 text-slate-500" colSpan={5}>
                    Belum ada kantor. Tambahkan minimal 1 kantor agar pegawai bisa check-in/check-out.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
