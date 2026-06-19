import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send HTTP-only cookies on every request
})

// ── Silent token refresh on 401 ───────────────────────────────────────────────
let isRefreshing = false
let pendingQueue = []

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    // Attempt one silent refresh on 401, but never for the refresh endpoint itself
    if (err.response?.status === 401 && original.url !== '/auth/refresh' && !original._retry) {
      if (isRefreshing) {
        // Queue callers that arrive while a refresh is already in-flight
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
        return api(original) // retry original request with new cookie
      } catch {
        pendingQueue.forEach((p) => p.reject())
        pendingQueue = []
        // Redirect to login only if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
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

// Auth
export const register = (data) => api.post('/auth/register', data)
export const loginApi = (data) => api.post('/auth/login', data)
export const logoutApi = () => api.post('/auth/logout')
export const getMe = () => api.get('/auth/me')

// Products
export const getProducts = (cursor = null, limit = 10) =>
  api.get('/products/', { params: { ...(cursor ? { cursor } : {}), limit } })
export const searchProducts = (q, limit = 20) => api.get('/products/search', { params: { q, limit } })
export const getProduct = (id) => api.get(`/products/${id}`)
export const createProduct = (data) => api.post('/products/', data)
export const updateProduct = (id, data) => api.put(`/products/${id}`, data)
export const deleteProduct = (id) => api.delete(`/products/${id}`)

// Customers
export const searchCustomers = (q, limit = 20) => api.get('/customers/search', { params: { q, limit } })
export const getCustomers = (cursor = null, limit = 10) =>
  api.get('/customers/', { params: { ...(cursor ? { cursor } : {}), limit } })
export const getCustomer = (id) => api.get(`/customers/${id}`)
export const createCustomer = (data) => api.post('/customers/', data)
export const deleteCustomer = (id) => api.delete(`/customers/${id}`)

// Orders
export const searchOrders = (q, limit = 20) => api.get('/orders/search', { params: { q, limit } })
export const getOrders = (cursor = null, limit = 10) =>
  api.get('/orders/', { params: { ...(cursor ? { cursor } : {}), limit } })
export const getOrder = (id) => api.get(`/orders/${id}`)
export const createOrder = (data) => api.post('/orders/', data)
export const deleteOrder = (id) => api.delete(`/orders/${id}`)

// Bulk import
export const bulkCreateProducts = (data) => api.post('/products/bulk', data)
export const bulkCreateCustomers = (data) => api.post('/customers/bulk', data)
export const bulkCreateOrders = (data) => api.post('/orders/bulk', data)

// Dashboard
export const getDashboardStats = () => api.get('/dashboard/')
export const getDashboardTrends = (weekOffset = 0) =>
  api.get('/dashboard/trends', { params: { week_offset: weekOffset } })
