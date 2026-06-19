import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import Products from '../../pages/Products'
import { FAKE_USER, renderWithAuth } from '../testUtils'

const PRODUCTS_PAGE = {
  items: [
    { id: 1, name: 'Blue Widget', sku: 'BW-001', price: 49.99, quantity: 100, description: 'A blue widget' },
    { id: 2, name: 'Red Gadget',  sku: 'RG-002', price: 29.99, quantity: 5,   description: null },
    { id: 3, name: 'Zero Stock',  sku: 'ZS-003', price: 9.99,  quantity: 0,   description: null },
  ],
  has_more: false,
  next_cursor: null,
}

const STATS = { total_products: 333, total_customers: 0, total_orders: 0, low_stock_count: 1, out_of_stock_count: 1 }

const server = setupServer(
  http.get('/auth/me',       () => HttpResponse.json(FAKE_USER)),
  http.post('/auth/refresh', () => HttpResponse.json({ detail: 'x' }, { status: 401 })),
  http.get('/products/',     () => HttpResponse.json(PRODUCTS_PAGE)),
  http.get('/dashboard/',    () => HttpResponse.json(STATS)),
  http.get('/products/search', ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? ''
    return HttpResponse.json(
      PRODUCTS_PAGE.items.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    )
  }),
  http.delete('/products/:id', () => new HttpResponse(null, { status: 204 })),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('Products page', () => {
  it('renders the page heading', async () => {
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText('Product Inventory')).toBeInTheDocument())
  })

  it('shows total_products from the dashboard stats', async () => {
    renderWithAuth(<Products />)
    // 333 is unique across all mock data
    await waitFor(() => expect(screen.getByText('333')).toBeInTheDocument())
  })

  it('renders product names in the table', async () => {
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText('Blue Widget')).toBeInTheDocument())
    expect(screen.getByText('Red Gadget')).toBeInTheDocument()
    expect(screen.getByText('Zero Stock')).toBeInTheDocument()
  })

  it('renders product SKUs in the table', async () => {
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText('BW-001')).toBeInTheDocument())
    expect(screen.getByText('RG-002')).toBeInTheDocument()
  })

  it('shows stock status badges (In Stock, Low Stock, Out of Stock)', async () => {
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText('In Stock')).toBeInTheDocument())
    // "Low Stock" label appears both in the stat card and as a badge — use getAllByText
    expect(screen.getAllByText('Low Stock').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Out of Stock').length).toBeGreaterThan(0)
  })

  it('shows empty state when no products exist', async () => {
    server.use(
      http.get('/products/', () =>
        HttpResponse.json({ items: [], has_more: false, next_cursor: null })
      )
    )
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText(/no products yet/i)).toBeInTheDocument())
  })

  it('shows search results from the server', async () => {
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText('Blue Widget')).toBeInTheDocument())

    const searchInput = screen.getByPlaceholderText(/search products/i)
    await userEvent.type(searchInput, 'Blue')

    await waitFor(() => expect(screen.getByText('Blue Widget')).toBeInTheDocument(), {
      timeout: 2000,
    })
  })

  it('opens Add Product modal when button is clicked', async () => {
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText('Blue Widget')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /add product/i }))
    await waitFor(() => expect(screen.getByText('Add New Product')).toBeInTheDocument())
  })

  it('opens delete confirmation when the first delete button is clicked', async () => {
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText('Blue Widget')).toBeInTheDocument())
    // Multiple rows have a Delete button — click the first one
    await userEvent.click(screen.getAllByTitle('Delete')[0])
    await waitFor(() => expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument())
  })

  it('sends status query param to the API when the filter changes', async () => {
    let capturedStatus = null
    server.use(
      http.get('/products/', ({ request }) => {
        capturedStatus = new URL(request.url).searchParams.get('status')
        return HttpResponse.json({ items: [], has_more: false, next_cursor: null })
      })
    )
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())

    const select = screen.getByRole('combobox')
    await userEvent.selectOptions(select, 'low_stock')

    await waitFor(() => expect(capturedStatus).toBe('low_stock'))
  })

  it('shows "no products match" when status filter returns empty results', async () => {
    server.use(
      http.get('/products/', () =>
        HttpResponse.json({ items: [], has_more: false, next_cursor: null })
      )
    )
    renderWithAuth(<Products />)
    await waitFor(() => expect(screen.getByText(/no products yet/i)).toBeInTheDocument())

    const select = screen.getByRole('combobox')
    await userEvent.selectOptions(select, 'out_of_stock')

    await waitFor(() => expect(screen.getByText(/no products/i)).toBeInTheDocument())
  })
})
