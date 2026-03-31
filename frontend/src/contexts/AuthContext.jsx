import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import client from '../api/client'
import { ENDPOINTS } from '../api/endpoints'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const userRaw = localStorage.getItem('user')
    if (userRaw) setUser(JSON.parse(userRaw))
    setReady(true)
  }, [])

  const login = async (email, password) => {
    const { data } = await client.post(ENDPOINTS.login, { email, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
