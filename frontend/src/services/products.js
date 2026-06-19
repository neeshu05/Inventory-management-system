import api from './instance'

export const getProducts = (cursor = null, limit = 10, status = null) =>
  api.get('/products/', { params: { ...(cursor ? { cursor } : {}), limit, ...(status && status !== 'all' ? { status } : {}) } })

export const searchProducts = (q, limit = 20) => 
  api.get('/products/search', { params: { q, limit } })

export const getProduct = (id) => api.get(`/products/${id}`)
export const createProduct = (data) => api.post('/products/', data)
export const updateProduct = (id, data) => api.put(`/products/${id}`, data)
export const deleteProduct = (id) => api.delete(`/products/${id}`)
