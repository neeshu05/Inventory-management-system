import api from './instance'

export const searchCustomers = (q, limit = 20) => 
  api.get('/customers/search', { params: { q, limit } })

export const getCustomers = (cursor = null, limit = 10) =>
  api.get('/customers/', { params: { ...(cursor ? { cursor } : {}), limit } })

export const getCustomer = (id) => api.get(`/customers/${id}`)
export const createCustomer = (data) => api.post('/customers/', data)
export const deleteCustomer = (id) => api.delete(`/customers/${id}`)
