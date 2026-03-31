import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      await login(form.email, form.password)
      toast.success('Login berhasil')
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      if (user.role === 'admin') navigate('/admin/dashboard')
      else if (user.role === 'sales') navigate('/sales/tasks')
      else navigate('/user/attendance')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#11295a] to-[#0b1c3e] p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 text-center">
          <img src="/assets/logo.png" className="mx-auto h-24" />
          <h1 className="mt-2 text-xl font-bold text-slate-800">My Sicepat Login</h1>
        </div>
        <div className="space-y-3">
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button disabled={loading} className="btn-primary w-full">
            {loading ? 'Loading...' : 'Login'}
          </button>
        </div>
      </form>
    </div>
  )
}
