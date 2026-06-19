import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import Orders from '../../pages/Orders'
import { FAKE_USER, renderWithAuth } from '../testUtils'

const ORDERS_PAGE = {
  items: [
    {
      id: 101,
      status: 'pending',
      total_amount: 149.99,
      created_at: '2024-03-10T10:00:00Z',
      customer: { id: 1, full_name: 'Alice Smith', email: 'alice@test.com' },
      items: [{ id: 1, product_id: 1, quantity: 2, unit_price: 74.995, product: { name: 'Blue Widget' } }],
    },
    {
      id: 102,
      status: 'completed',
      total_amount: 29.99,
      created_at: '2024-03-08T09:00:00Z',
      customer: { id: 2, full_name: 'Bob Jones', email: 'bob@test.com' },
      items: [{ id: 2, product_id: 2, quantity: 1, unit_price: 29.99, product: { name: 'Red Gadget' } }],
    },
  ],
  has_more: false,
  next_cursor: null,
}

const STATS = { total_products: 10, total_customers: 5, total_orders: 55, low_stock_count: 0, out_of_stock_count: 0 }

const server = setupServer(
  http.get('/auth/me',       () => HttpResponse.json(FAKE_USER)),
  http.post('/auth/refresh', () => HttpResponse.json({ detail: 'x' }, { status: 401 })),
  http.get('/orders/',       () => HttpResponse.json(ORDERS_PAGE)),
  http.get('/dashboard/',    () => HttpResponse.json(STATS)),
  http.get('/orders/search', ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? ''
    return HttpResponse.json(
      ORDERS_PAGE.items.filter((o) =>
        o.customer.full_name.toLowerCase().includes(q.toLowerCase())
      )
    )
  }),
  http.patch('/orders/:id/complete', ({ params }) => {
    const order = ORDERS_PAGE.items.find((o) => o.id === Number(params.id))
    return HttpResponse.json({ ...order, status: 'completed' })
  }),
  http.delete('/orders/:id', () => new HttpResponse(null, { status: 204 })),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('Orders page', () => {
  it('renders the page heading', async () => {
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('Orders')).toBeInTheDocument())
  })

  it('shows Total Orders from dashboard stats', async () => {
    renderWithAuth(<Orders />)
    // 55 is unique across all mock data
    await waitFor(() => expect(screen.getByText('55')).toBeInTheDocument())
    expect(screen.getByText(/total orders/i)).toBeInTheDocument()
  })

  it('renders order rows with customer names', async () => {
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
  })

  it('displays order IDs with # prefix', async () => {
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('#101')).toBeInTheDocument())
    expect(screen.getByText('#102')).toBeInTheDocument()
  })

  it('shows status badges for pending and completed orders', async () => {
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument())
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('shows a complete button only for pending orders', async () => {
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    // Only one pending order (id=101) — only one complete button
    const completeBtns = screen.getAllByTitle('Mark as completed')
    expect(completeBtns).toHaveLength(1)
  })

  it('calls PATCH /orders/:id/complete when the complete button is clicked', async () => {
    let completedId = null
    server.use(
      http.patch('/orders/:id/complete', ({ params }) => {
        completedId = Number(params.id)
        return HttpResponse.json({ ...ORDERS_PAGE.items[0], status: 'completed' })
      })
    )
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    await userEvent.click(screen.getByTitle('Mark as completed'))
    await waitFor(() => expect(completedId).toBe(101))
  })

  it('shows success toast after completing an order', async () => {
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    await userEvent.click(screen.getByTitle('Mark as completed'))
    await waitFor(
      () => expect(screen.getByText(/marked as completed/i)).toBeInTheDocument(),
      { timeout: 3000 }
    )
  })

  it('shows a cancel button for every order', async () => {
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    expect(screen.getAllByTitle('Cancel order')).toHaveLength(2)
  })

  it('opens cancel confirmation modal when cancel button is clicked', async () => {
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument())
    // Multiple cancel buttons — click the first one
    await userEvent.click(screen.getAllByTitle('Cancel order')[0])
    await waitFor(() =>
      expect(screen.getByText(/automatically restored/i)).toBeInTheDocument()
    )
  })

  it('shows empty state when no orders exist', async () => {
    server.use(
      http.get('/orders/', () =>
        HttpResponse.json({ items: [], has_more: false, next_cursor: null })
      )
    )
    renderWithAuth(<Orders />)
    await waitFor(() => expect(screen.getByText(/no orders yet/i)).toBeInTheDocument())
  })

  it('shows pending count stat on this page', async () => {
    renderWithAuth(<Orders />)
    // 1 pending order on this page — the Pending (page) stat card shows "1"
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 3 })
      expect(headings.some((h) => h.textContent === '1')).toBe(true)
    })
  })
})
