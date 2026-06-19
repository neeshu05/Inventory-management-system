import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Silent 401 → refresh → retry ────────────────────────────────────────────
let isRefreshing = false
let pendingQueue = []

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    if (
      err.response?.status === 401 &&
      original.url !== '/auth/refresh' &&
      original.url !== '/auth/login' &&
      !original._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject })
        })
          .then(() => api(original))
          .catch((e) => Promise.reject(e))
      }

      original._retry = true
      isRefreshing = true

      const storedRefresh = localStorage.getItem('refresh_token')
      if (!storedRefresh) {
        isRefreshing = false
        if (window.location.pathname !== '/login') window.location.href = '/login'
        return Promise.reject(new Error('Session expired. Please sign in again.'))
      }

      try {
        const res = await api.post('/auth/refresh', { refresh_token: storedRefresh })
        localStorage.setItem('access_token', res.data.access_token)
        localStorage.setItem('refresh_token', res.data.refresh_token)
        pendingQueue.forEach((p) => p.resolve())
        pendingQueue = []
        original.headers.Authorization = `Bearer ${res.data.access_token}`
        return api(original)
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        pendingQueue.forEach((p) => p.reject())
        pendingQueue = []
        if (window.location.pathname !== '/login') window.location.href = '/login'
        return Promise.reject(new Error('Session expired. Please sign in again.'))
      } finally {
        isRefreshing = false
      }
    }

    const message =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      'An unexpected error occurred'
    return Promise.reject(new Error(message))
  }
)

export default api
