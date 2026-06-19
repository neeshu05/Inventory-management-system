import api from './instance'

export const register = (data) => api.post('/auth/register', data)
export const loginApi = (data) => api.post('/auth/login', data)
export const logoutApi = () => api.post('/auth/logout')
export const getMe = () => api.get('/auth/me')
