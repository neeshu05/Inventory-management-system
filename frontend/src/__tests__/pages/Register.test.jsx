import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import Register from '../../pages/Register'
import { AuthProvider } from '../../context/AuthContext'

const server = setupServer(
  http.get('/auth/me', () => HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })),
  http.post('/auth/refresh', () => HttpResponse.json({ detail: 'No token' }, { status: 401 })),
  http.post('/auth/register', async ({ request }) => {
    const { username } = await request.json()
    if (username === 'taken') {
      return HttpResponse.json({ detail: 'Username already registered' }, { status: 400 })
    }
    return HttpResponse.json({
      user: { id: 1, username, email: 'x@test.com', is_active: true, created_at: '2024-01-01T00:00:00Z' },
    })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<div>App Root</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

async function fillForm({ username = 'alice', email = 'alice@test.com', password = 'Password1', confirm = 'Password1' } = {}) {
  await userEvent.type(screen.getByPlaceholderText(/e\.g\. johndoe/i), username)
  await userEvent.type(screen.getByPlaceholderText(/john@example\.com/i), email)
  const [pwdInput, confirmInput] = screen.getAllByPlaceholderText(/characters|re-enter/i)
  await userEvent.type(pwdInput, password)
  await userEvent.type(confirmInput, confirm)
}

describe('Register page', () => {
  it('renders all form fields', () => {
    renderRegister()
    expect(screen.getByPlaceholderText(/e\.g\. johndoe/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/john@example\.com/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('has a link back to the login page', () => {
    renderRegister()
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows an error toast when passwords do not match', async () => {
    renderRegister()
    await fillForm({ password: 'Password1', confirm: 'Different9' })
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    )
  })

  it('redirects to / on successful registration', async () => {
    renderRegister()
    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(screen.getByText('App Root')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('shows error toast when username is already taken', async () => {
    renderRegister()
    await fillForm({ username: 'taken' })
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByText(/already registered/i)).toBeInTheDocument(),
      { timeout: 3000 }
    )
  })

  it('disables submit button while request is in flight', async () => {
    server.use(
      http.post('/auth/register', async () => {
        await new Promise((r) => setTimeout(r, 100))
        return HttpResponse.json({ detail: 'error' }, { status: 500 })
      })
    )
    renderRegister()
    await fillForm()
    const btn = screen.getByRole('button', { name: /create account/i })
    await userEvent.click(btn)
    expect(btn).toBeDisabled()
    await waitFor(() => expect(btn).not.toBeDisabled(), { timeout: 3000 })
  })
})
