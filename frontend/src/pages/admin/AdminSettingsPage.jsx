import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import client from '../../api/client'
import { ENDPOINTS } from '../../api/endpoints'

export default function AdminSettingsPage() {
  const [form, setForm] = useState({
    office_name: '',
    office_latitude: '',
    office_longitude: '',
    office_radius_meter: 300,
    check_in_time: '08:00:00',
    check_out_time: '17:00:00',
    default_task_max_claimants: 2,
  })
  const [gettingLocation, setGettingLocation] = useState(false)

  useEffect(() => {
    const run = async () => {
      const { data } = await client.get(ENDPOINTS.settings)
      if (data) setForm(data)
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
        setForm((prev) => ({
          ...prev,
          office_latitude: Number(coords.latitude).toFixed(7),
          office_longitude: Number(coords.longitude).toFixed(7),
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

  return (
    <form onSubmit={submit} className="card grid gap-4 md:grid-cols-2">
      <h2 className="md:col-span-2 text-lg font-semibold">Pengaturan Absensi</h2>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Nama Kantor</label>
        <input className="input" placeholder="Contoh: Kantor Pusat" value={form.office_name || ''} onChange={(e) => setForm({ ...form, office_name: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Radius Kantor (meter)</label>
        <input className="input" type="number" placeholder="Contoh: 300" value={form.office_radius_meter || ''} onChange={(e) => setForm({ ...form, office_radius_meter: e.target.value })} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Latitude Kantor</label>
        <input className="input" placeholder="-6.2000000" value={form.office_latitude || ''} onChange={(e) => setForm({ ...form, office_latitude: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Longitude Kantor</label>
        <input className="input" placeholder="106.8166667" value={form.office_longitude || ''} onChange={(e) => setForm({ ...form, office_longitude: e.target.value })} />
      </div>

      <div className="md:col-span-2">
        <button type="button" className="btn bg-[#11295a] text-white hover:opacity-90" onClick={getOfficeLocation} disabled={gettingLocation}>
          {gettingLocation ? 'Mengambil lokasi...' : 'Dapatkan Lokasi Kantor'}
        </button>
      </div>

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
      <button className="btn-primary md:col-span-2 max-w-fit">Simpan Settings</button>
    </form>
  )
}
