import api from './instance'

export const bulkCreateProducts = (data) => api.post('/products/bulk', data)
export const bulkCreateCustomers = (data) => api.post('/customers/bulk', data)
export const bulkCreateOrders = (data) => api.post('/orders/bulk', data)
