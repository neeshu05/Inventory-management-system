/**
 * Integration tests for the Login page.
 * API calls are intercepted by MSW — no real server needed.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

import Login from '../../pages/Login'
import { AuthProvider } from '../../context/AuthContext'

// ── MSW server ────────────────────────────────────────────────────────────────

const server = setupServer(
  // AuthContext calls this on mount to check the session
  http.get('/auth/me', () =>
    HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })
  ),

  // The interceptor tries to refresh when /auth/me returns 401
  http.post('/auth/refresh', () =>
    HttpResponse.json({ detail: 'No refresh token' }, { status: 401 })
  ),

  http.post('/auth/login', async ({ request }) => {
    const { username, password } = await request.json()
    if (username === 'admin' && password === 'Password1') {
      return HttpResponse.json({
        user: { id: 1, username: 'admin', email: 'a@b.com', is_active: true, created_at: new Date().toISOString() },
      })
    }
    return HttpResponse.json({ detail: 'Incorrect username or password' }, { status: 401 })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Login navigates to '/' on success; App.jsx redirects from there */}
          <Route path="/" element={<div>App Root</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Login page', () => {
  it('renders the username and password inputs', async () => {
    renderLogin()
    // findBy waits for async effects (AuthContext getMe) to settle
    await screen.findByPlaceholderText(/enter your username/i)
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument()
  })

  it('renders the Sign In button', async () => {
    renderLogin()
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('has a link to the register page', async () => {
    renderLogin()
    await screen.findByRole('button', { name: /sign in/i })
    expect(screen.getByRole('link', { name: /create one/i })).toBeInTheDocument()
  })

  it('redirects to / on successful login', async () => {
    renderLogin()
    await screen.findByRole('button', { name: /sign in/i })
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'admin')
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'Password1')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('App Root')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows an error toast on wrong credentials', async () => {
    renderLogin()
    await screen.findByRole('button', { name: /sign in/i })
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'admin')
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText(/incorrect username or password/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('disables the Sign In button while the request is in flight', async () => {
    server.use(
      http.post('/auth/login', async () => {
        await new Promise((r) => setTimeout(r, 150))
        return HttpResponse.json({ detail: 'Incorrect username or password' }, { status: 401 })
      })
    )
    renderLogin()
    await screen.findByRole('button', { name: /sign in/i })
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'admin')
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'pass')
    const btn = screen.getByRole('button', { name: /sign in/i })
    await userEvent.click(btn)
    expect(btn).toBeDisabled()
    await waitFor(() => expect(btn).not.toBeDisabled(), { timeout: 3000 })
  })
})
