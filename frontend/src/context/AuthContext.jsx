import { createContext, useContext, useState, useEffect } from 'react'
import { getMe, logoutApi } from '../services/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount, validate session via cookie — no localStorage involved
  useEffect(() => {
    getMe()
      .then((res) => setUser(res.data))
      .catch(() => {}) // 401 interceptor handles redirect if both tokens are expired
      .finally(() => setLoading(false))
  }, [])

  // Called after login/register — backend has already set the cookies
  const login = (userData) => setUser(userData)

  const logout = async () => {
    setUser(null) // clear user state immediately
    try { await logoutApi() } catch {} // clear cookies on server
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
