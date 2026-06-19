import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import Customers from '../../pages/Customers'
import { FAKE_USER, renderWithAuth } from '../testUtils'

const CUSTOMER_LIST = {
  items: [
    { id: 1, full_name: 'Alice Smith', email: 'alice@test.com', phone: '9876543210', created_at: '2024-03-01T10:00:00Z' },
    { id: 2, full_name: 'Bob Jones',   email: 'bob@test.com',   phone: null,         created_at: '2024-03-05T10:00:00Z' },
  ],
  has_more: false,
  next_cursor: null,
}

const STATS = { total_products: 0, total_customers: 99, total_orders: 0, low_stock_count: 0, out_of_stock_count: 0 }

const server = setupServer(
  http.get('/auth/me',       () => HttpResponse.json(FAKE_USER)),
  http.post('/auth/refresh', () => HttpResponse.json({ detail: 'x' }, { status: 401 })),
  http.get('/customers/',    () => HttpResponse.json(CUSTOMER_LIST)),
  http.get('/dashboard/',    () => HttpResponse.json(STATS)),
  http.get('/customers/search', ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? ''
    return HttpResponse.json(
      CUSTOMER_LIST.items.filter((c) =>
        c.full_name.toLowerCase().includes(q.toLowerCase())
      )
    )
  }),
  http.post('/customers/', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json(
      { id: 3, ...body, created_at: new Date().toISOString() },
      { status: 201 }
    )
  }),
  http.delete('/customers/:id', () => new HttpResponse(null, { status: 204 })),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('Customers page', () => {
  it('renders the page heading', async () => {
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText('Customers')).toBeInTheDocument())
  })

  it('shows total customers from dashboard stats', async () => {
    renderWithAuth(<Customers />)
    // 99 is unique across all mock data
    await waitFor(() => expect(screen.getByText('99')).toBeInTheDocument())
    expect(screen.getByText(/total customers/i)).toBeInTheDocument()
  })

  it('renders customer names in the table', async () => {
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
  })

  it('shows customer email addresses in the table', async () => {
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText('alice@test.com')).toBeInTheDocument())
    expect(screen.getByText('bob@test.com')).toBeInTheDocument()
  })

  it('shows em-dash for customers without a phone number', async () => {
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    // Bob has no phone — should show em-dash placeholder
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows empty state when no customers exist', async () => {
    server.use(
      http.get('/customers/', () =>
        HttpResponse.json({ items: [], has_more: false, next_cursor: null })
      )
    )
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument())
  })

  it('opens Add Customer modal when header button is clicked', async () => {
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    // The header "Add Customer" button (first occurrence)
    await userEvent.click(screen.getAllByRole('button', { name: /add customer/i })[0])
    await waitFor(() => expect(screen.getByText('Add New Customer')).toBeInTheDocument())
  })

  it('submits the add customer form and shows a success toast', async () => {
    server.use(
      http.get('/customers/', () =>
        HttpResponse.json({ items: [], has_more: false, next_cursor: null })
      )
    )
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText(/no customers yet/i)).toBeInTheDocument())

    // Open modal
    await userEvent.click(screen.getAllByRole('button', { name: /add customer/i })[0])
    await waitFor(() => expect(screen.getByText('Add New Customer')).toBeInTheDocument())

    // Fill the form
    await userEvent.type(screen.getByPlaceholderText(/jane smith/i), 'New Customer')
    await userEvent.type(screen.getByPlaceholderText(/jane@company/i), 'new@test.com')

    // Click the form's submit button (inside the modal — index 1 = second occurrence)
    await userEvent.click(screen.getAllByRole('button', { name: /add customer/i })[1])

    await waitFor(
      () => expect(screen.getByText(/customer added/i)).toBeInTheDocument(),
      { timeout: 3000 }
    )
  })

  it('opens delete confirmation when a delete button is clicked', async () => {
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    // Multiple rows have Delete buttons — click the first one
    await userEvent.click(screen.getAllByTitle('Delete')[0])
    await waitFor(() =>
      expect(screen.getByText(/associated orders/i)).toBeInTheDocument()
    )
  })

  it('shows search results from the server', async () => {
    renderWithAuth(<Customers />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'Alice')

    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument(), {
      timeout: 2000,
    })
  })
})
