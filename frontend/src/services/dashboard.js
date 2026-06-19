import api from './instance'

export const getDashboardStats = () => api.get('/dashboard/')
export const getDashboardTrends = (weekOffset = 0) =>
  api.get('/dashboard/trends', { params: { week_offset: weekOffset } })
export const getLowStockProducts = (skip = 0, limit = 5) =>
  api.get('/dashboard/low-stock', { params: { skip, limit } })
