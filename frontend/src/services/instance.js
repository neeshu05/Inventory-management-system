import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// ── Silent 401 → refresh → retry ────────────────────────────────────────────
let isRefreshing = false
let pendingQueue = []

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    if (err.response?.status === 401 && original.url !== '/auth/refresh' && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject })
        })
          .then(() => api(original))
          .catch((e) => Promise.reject(e))
      }

      original._retry = true
      isRefreshing = true

      try {
        await api.post('/auth/refresh')
        pendingQueue.forEach((p) => p.resolve())
        pendingQueue = []
        return api(original)
      } catch {
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
