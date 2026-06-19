import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import Dashboard from '../../pages/Dashboard'
import { FAKE_USER, renderWithAuth } from '../testUtils'

// Distinctive numbers that won't collide with chart tick labels (all trends are zero)
const STATS = {
  total_products: 123,
  total_customers: 456,
  total_orders: 78,
  low_stock_count: 9,
  out_of_stock_count: 4,
}

const TRENDS = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  order_counts: [0, 0, 0, 0, 0, 0, 0],
  revenue: [0, 0, 0, 0, 0, 0, 0],
  today_idx: 3,
  week_label: 'This Week',
}

const LOW_STOCK_PAGE = {
  items: [
    { id: 1, name: 'Scarce Widget', sku: 'SC-1', price: 10.0, quantity: 2, description: null },
    { id: 2, name: 'Empty Gadget',  sku: 'EG-1', price: 20.0, quantity: 0, description: null },
  ],
  total: 2,
}

const server = setupServer(
  http.get('/auth/me',             () => HttpResponse.json(FAKE_USER)),
  http.post('/auth/refresh',       () => HttpResponse.json({ detail: 'x' }, { status: 401 })),
  http.get('/dashboard/',          () => HttpResponse.json(STATS)),
  http.get('/dashboard/trends',    () => HttpResponse.json(TRENDS)),
  http.get('/dashboard/low-stock', () => HttpResponse.json(LOW_STOCK_PAGE)),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Helper: wait until the spinner is gone (loading=false)
async function waitForLoad() {
  await waitFor(() => expect(screen.queryByText('Dashboard')).toBeInTheDocument())
}

describe('Dashboard page', () => {
  it('renders the Dashboard heading', async () => {
    renderWithAuth(<Dashboard />)
    await waitForLoad()
  })

  it('shows total_products value in a stat card', async () => {
    renderWithAuth(<Dashboard />)
    // 123 is unique across all mock data
    await waitFor(() => expect(screen.getByText('123')).toBeInTheDocument())
  })

  it('shows total_orders value in a stat card', async () => {
    renderWithAuth(<Dashboard />)
    await waitFor(() => expect(screen.getByText('78')).toBeInTheDocument())
  })

  it('shows low_stock_count value in a stat card', async () => {
    renderWithAuth(<Dashboard />)
    // 9 is unique — low_stock_count
    await waitFor(() => expect(screen.getByText('9')).toBeInTheDocument())
  })

  it('shows out_of_stock_count value in a stat card', async () => {
    renderWithAuth(<Dashboard />)
    // 4 is unique — out_of_stock_count
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument())
  })

  it('shows the Low Stock Alerts section when there are low-stock items', async () => {
    renderWithAuth(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Low Stock Alerts')).toBeInTheDocument())
  })

  it('renders low-stock product names in the table', async () => {
    renderWithAuth(<Dashboard />)
    await waitFor(() => expect(screen.getByText('Scarce Widget')).toBeInTheDocument())
    expect(screen.getByText('Empty Gadget')).toBeInTheDocument()
  })

  it('shows both Low Stock and Out of Stock badges in the table', async () => {
    renderWithAuth(<Dashboard />)
    await waitFor(() => {
      // Multiple "Low Stock" texts may exist (stat card label + badge) — use getAllByText
      expect(screen.getAllByText('Low Stock').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Out of Stock').length).toBeGreaterThan(0)
    })
  })

  it('shows pagination when total exceeds page size', async () => {
    server.use(
      http.get('/dashboard/low-stock', () =>
        HttpResponse.json({
          items: Array.from({ length: 5 }, (_, i) => ({
            id: i + 1, name: `Prod${i}`, sku: `S${i}`, price: 1, quantity: i + 1, description: null,
          })),
          total: 12,
        })
      )
    )
    renderWithAuth(<Dashboard />)
    await waitFor(() => expect(screen.getByText(/page 1 of/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('hides Low Stock Alerts section when no items are below threshold', async () => {
    server.use(
      http.get('/dashboard/', () =>
        HttpResponse.json({ ...STATS, low_stock_count: 0, out_of_stock_count: 0 })
      )
    )
    renderWithAuth(<Dashboard />)
    await waitForLoad()
    await waitFor(() =>
      expect(screen.queryByText('Low Stock Alerts')).not.toBeInTheDocument()
    )
  })
})
