import api from './instance'

export const searchOrders = (q, limit = 20) => 
  api.get('/orders/search', { params: { q, limit } })

export const getOrders = (cursor = null, limit = 10) =>
  api.get('/orders/', { params: { ...(cursor ? { cursor } : {}), limit } })

export const getOrder = (id) => api.get(`/orders/${id}`)
export const createOrder = (data) => api.post('/orders/', data)
export const completeOrder = (id) => api.patch(`/orders/${id}/complete`)
export const deleteOrder = (id) => api.delete(`/orders/${id}`)
