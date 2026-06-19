import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '../context/AuthContext'

export const FAKE_USER = {
  id: 1,
  username: 'admin',
  email: 'admin@test.com',
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
}

export function renderWithAuth(ui, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}
