import { useEffect, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { useDebounce } from '../hooks/useDebounce'
import { getOrders, searchOrders, getOrder, createOrder, completeOrder, deleteOrder } from '../services/orders'
import { getCustomers } from '../services/customers'
import { getProducts } from '../services/products'
import { getDashboardStats } from '../services/dashboard'
import BulkImportModal from '../components/BulkImportModal'

const PAGE_LIMIT = 10

const STATUS_BADGE = {
  pending:   'badge-amber',
  completed: 'badge-green',
  cancelled: 'badge-red',
}

function StatusBadge({ status }) {
  return <span className={STATUS_BADGE[status] ?? 'badge-blue'}>{status}</span>
}

function CreateOrderForm({ onSubmit, onCancel, saving }) {
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState([{ product_id: '', quantity: 1 }])

  useEffect(() => {
    getCustomers(null, 500).then((r) => setCustomers(r.data.items)).catch(() => {})
    getProducts(null, 500).then((r) => setProducts(r.data.items)).catch(() => {})
  }, [])

  const addItem = () => setItems((prev) => [...prev, { product_id: '', quantity: 1 }])
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i))
  const updateItem = (i, key, val) =>
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [key]: val } : item)))

  const estimatedTotal = items.reduce((sum, item) => {
    const p = products.find((x) => x.id === parseInt(item.product_id))
    return p ? sum + p.price * (parseInt(item.quantity) || 0) : sum
  }, 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    const validItems = items.filter((item) => item.product_id && item.quantity > 0)
    if (!customerId) return toast.error('Please select a customer')
    if (validItems.length === 0) return toast.error('Add at least one item')
    onSubmit({
      customer_id: parseInt(customerId),
      items: validItems.map((item) => ({ product_id: parseInt(item.product_id), quantity: parseInt(item.quantity) })),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="label">Customer *</label>
        <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
          <option value="">Select a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name} — {c.email}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Order Items *</label>
          <button type="button" onClick={addItem} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
            <Icon name="add" size={14} /> Add item
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => {
            const selected = products.find((p) => p.id === parseInt(item.product_id))
            return (
              <div key={i} className="flex items-center gap-2 bg-surface-container-low p-2 rounded-lg">
                <select
                  className="input flex-1 bg-white text-sm"
                  value={item.product_id}
                  onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                  required
                >
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.quantity === 0}>
                      {p.name} — ₹{p.price.toFixed(2)} ({p.quantity} in stock)
                    </option>
                  ))}
                </select>
                <input
                  type="number" min="1" max={selected?.quantity || 9999}
                  className="input w-20 bg-white text-center text-sm"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                  required
                />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="p-1.5 text-outline hover:text-error transition-colors">
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {estimatedTotal > 0 && (
        <div className="flex justify-between items-center py-3 px-4 bg-primary/8 rounded-lg border border-primary/20">
          <span className="text-sm font-medium text-primary">Estimated Total</span>
          <span className="text-lg font-bold text-primary">₹{estimatedTotal.toFixed(2)}</span>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-outline-variant">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          <Icon name="shopping_cart_checkout" size={18} />
          {saving ? 'Placing…' : 'Place Order'}
        </button>
      </div>
    </form>
  )
}

function OrderDetailView({ order }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Order ID', value: `#${order.id}`, mono: true },
          { label: 'Status',   value: <StatusBadge status={order.status} /> },
          { label: 'Customer', value: order.customer?.full_name || 'Unknown', sub: order.customer?.email },
          { label: 'Date',     value: new Date(order.created_at).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' }) },
        ].map(({ label, value, sub, mono }) => (
          <div key={label} className="bg-surface-container-low p-3 rounded-lg">
            <p className="text-xs text-outline mb-1 uppercase tracking-wider font-semibold">{label}</p>
            <p className={`font-semibold text-on-surface ${mono ? 'font-mono' : ''}`}>{value}</p>
            {sub && <p className="text-xs text-outline mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-on-surface mb-2 uppercase tracking-wider">Items</h3>
        <div className="rounded-lg border border-outline-variant overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="table-th">Product</th>
                <th className="table-th text-center">Qty</th>
                <th className="table-th text-right">Unit Price</th>
                <th className="table-th text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="table-td font-medium text-on-surface">{item.product?.name || `Product #${item.product_id}`}</td>
                  <td className="table-td text-center text-on-surface-variant">{item.quantity}</td>
                  <td className="table-td text-right text-on-surface-variant">₹{item.unit_price.toFixed(2)}</td>
                  <td className="table-td text-right font-semibold">₹{(item.unit_price * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-container-low border-t-2 border-outline-variant">
                <td colSpan={3} className="table-td text-right font-semibold text-on-surface-variant">Total</td>
                <td className="table-td text-right font-bold text-on-surface text-base">₹{order.total_amount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function Orders() {
  const [items, setItems] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [cursorStack, setCursorStack] = useState([])
  const [cursor, setCursor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const debouncedSearch = useDebounce(search, 350)

  const [totalOrders, setTotalOrders] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [viewOrder, setViewOrder] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const loadPage = (cur = null, paginate = false) => {
    if (paginate) setPaging(true)
    else setLoading(true)
    return getOrders(cur, PAGE_LIMIT)
      .then((r) => {
        setItems(r.data.items)
        setNextCursor(r.data.next_cursor)
        setHasMore(r.data.has_more)
      })
      .catch((e) => toast.error(e.message))
      .finally(() => { setLoading(false); setPaging(false) })
  }

  const loadStats = () =>
    getDashboardStats().then((r) => setTotalOrders(r.data.total_orders)).catch(() => {})

  useEffect(() => { loadPage(null); loadStats() }, [])

  // Server-side search with debounce
  useEffect(() => {
    if (!debouncedSearch.trim()) { setSearchResults(null); return }
    setSearchLoading(true)
    searchOrders(debouncedSearch.trim(), 50)
      .then((r) => setSearchResults(r.data))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false))
  }, [debouncedSearch])

  const goNext = () => {
    setCursorStack((s) => [...s, cursor])
    setCursor(nextCursor)
    loadPage(nextCursor, true)
  }

  const goPrev = () => {
    const stack = [...cursorStack]
    const prev = stack.pop() ?? null
    setCursorStack(stack)
    setCursor(prev)
    loadPage(prev, true)
  }

  const reload = () => {
    setCursorStack([])
    setCursor(null)
    setSearch('')
    setSearchResults(null)
    loadPage(null)
    loadStats()
  }

  const isSearchMode = search.trim().length > 0
  const displayed = useMemo(
    () => isSearchMode ? (searchResults ?? []) : items,
    [isSearchMode, searchResults, items]
  )

  const handleView = async (id) => {
    try { const res = await getOrder(id); setViewOrder(res.data) }
    catch (e) { toast.error(e.message) }
  }

  const handleCreate = async (data) => {
    setSaving(true)
    try { await createOrder(data); toast.success('Order placed'); setShowCreate(false); reload() }
    catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try { await deleteOrder(deleteTarget.id); toast.success('Order cancelled — stock restored'); setDeleteTarget(null); reload() }
    catch (e) { toast.error(e.message) }
  }

  const handleComplete = async (id) => {
    try { await completeOrder(id); toast.success('Order marked as completed'); reload() }
    catch (e) { toast.error(e.message) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      let all = [], cur = null
      do {
        const r = await getOrders(cur, 200)
        all = [...all, ...r.data.items]
        cur = r.data.has_more ? r.data.next_cursor : null
      } while (cur)

      const rows = all.map((o) => ({
        'Order ID': `#${o.id}`,
        Customer: o.customer?.full_name || '',
        Email: o.customer?.email || '',
        Items: o.items.map((i) => `${i.product?.name || i.product_id} x${i.quantity}`).join('; '),
        'Total (₹)': o.total_amount,
        Status: o.status,
        Date: new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 26 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 16 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Orders')
      XLSX.writeFile(wb, 'orders_export.xlsx')
      toast.success(`Exported ${all.length} orders`)
    } catch (e) { toast.error(e.message) }
    finally { setExporting(false) }
  }

  const pending   = items.filter((o) => o.status === 'pending').length
  const completed = items.filter((o) => o.status === 'completed').length
  const revenue   = items.filter((o) => o.status === 'completed').reduce((s, o) => s + o.total_amount, 0)
  const tableLoading = loading || (isSearchMode && searchLoading && searchResults === null)

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-display-md font-bold text-on-surface">Orders</h2>
          <p className="text-sm text-on-surface-variant mt-1">View and manage all customer orders and fulfillment status.</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            <Icon name="upload_file" size={18} /> Import CSV
          </button>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? <span className="w-4 h-4 border-2 border-on-surface border-t-transparent rounded-full animate-spin" /> : <Icon name="download" size={18} />}
            Export
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="add_shopping_cart" size={18} /> Create Order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
            <Icon name="shopping_cart" fill size={24} className="text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-outline uppercase tracking-wider">Total Orders</p>
            <h3 className="text-[28px] font-bold leading-none mt-1">{totalOrders}</h3>
          </div>
        </div>
        <div className="card p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center shrink-0">
            <Icon name="pending" fill size={24} className="text-tertiary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-outline uppercase tracking-wider">Pending (page)</p>
            <h3 className="text-[28px] font-bold leading-none mt-1 text-tertiary">{pending}</h3>
          </div>
        </div>
        <div className="card p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
            <Icon name="check_circle" fill size={24} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-outline uppercase tracking-wider">Completed (page)</p>
            <h3 className="text-[28px] font-bold leading-none mt-1 text-green-600">{completed}</h3>
          </div>
        </div>
        <div className="card p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary-container/40 rounded-lg flex items-center justify-center shrink-0">
            <Icon name="payments" fill size={24} className="text-secondary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-outline uppercase tracking-wider">Revenue (page)</p>
            <h3 className="text-[28px] font-bold leading-none mt-1">
              ₹{revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h3>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-[17px] font-semibold text-on-surface shrink-0">Order History</h3>
            <div className="relative">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              {isSearchMode && searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <input
                className="pl-9 pr-4 py-1.5 bg-surface-container border border-outline-variant rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all w-64 placeholder:text-outline"
                placeholder="Search by customer or order ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-outline whitespace-nowrap">
            {isSearchMode
              ? `${displayed.length} result${displayed.length !== 1 ? 's' : ''} for "${search}"`
              : `${totalOrders} order${totalOrders !== 1 ? 's' : ''} total`}
          </p>
        </div>

        <div className="overflow-x-auto custom-scrollbar relative">
          {tableLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              <div className={`transition-opacity duration-150 ${paging ? 'opacity-40' : 'opacity-100'}`}>
                {displayed.length === 0 ? (
                  <div className="py-16 text-center text-on-surface-variant text-sm">
                    {isSearchMode
                      ? `No orders found for "${search}".`
                      : 'No orders yet. Click Create Order to get started.'}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low">
                        <th className="table-th">Order ID</th>
                        <th className="table-th">Customer</th>
                        <th className="table-th">Items</th>
                        <th className="table-th text-right">Total</th>
                        <th className="table-th">Status</th>
                        <th className="table-th">Date</th>
                        <th className="table-th text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {displayed.map((o) => (
                        <tr key={o.id} className="hover:bg-surface-container-lowest transition-colors group">
                          <td className="table-td font-mono text-outline text-xs font-semibold">#{o.id}</td>
                          <td className="table-td font-semibold text-on-surface">{o.customer?.full_name || '—'}</td>
                          <td className="table-td text-on-surface-variant">{o.items.length} item{o.items.length !== 1 ? 's' : ''}</td>
                          <td className="table-td text-right font-bold">₹{o.total_amount.toFixed(2)}</td>
                          <td className="table-td"><StatusBadge status={o.status} /></td>
                          <td className="table-td text-on-surface-variant text-xs">
                            {new Date(o.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="table-td text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface-variant transition-colors"
                                onClick={() => handleView(o.id)}
                                title="View details"
                              >
                                <Icon name="visibility" size={18} />
                              </button>
                              {o.status === 'pending' && (
                                <button
                                  className="p-1.5 hover:bg-green-100 rounded-lg text-green-600 transition-colors"
                                  onClick={() => handleComplete(o.id)}
                                  title="Mark as completed"
                                >
                                  <Icon name="check_circle" size={18} />
                                </button>
                              )}
                              <button
                                className="p-1.5 hover:bg-error-container/30 rounded-lg text-error transition-colors"
                                onClick={() => setDeleteTarget(o)}
                                title="Cancel order"
                              >
                                <Icon name="cancel" size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {paging && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="animate-spin w-7 h-7 border-[3px] border-primary border-t-transparent rounded-full" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Pagination — hidden while searching */}
        {!tableLoading && !isSearchMode && (cursorStack.length > 0 || hasMore) && (
          <div className="px-6 py-4 border-t border-outline-variant flex items-center justify-between">
            <div className="flex gap-2">
              <button
                className="px-4 py-2 border border-outline-variant rounded-lg text-sm hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                disabled={cursorStack.length === 0 || paging}
                onClick={goPrev}
              >
                <Icon name="chevron_left" size={16} /> Previous
              </button>
              <button
                className="px-4 py-2 border border-outline-variant rounded-lg text-sm hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                disabled={!hasMore || paging}
                onClick={goNext}
              >
                Next <Icon name="chevron_right" size={16} />
              </button>
            </div>
            <p className="text-xs text-outline">Page {cursorStack.length + 1} · {PAGE_LIMIT} per page</p>
          </div>
        )}
      </div>

      <BulkImportModal entity="orders" isOpen={showImport} onClose={() => setShowImport(false)} onSuccess={reload} />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Order" size="lg">
        <CreateOrderForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} saving={saving} />
      </Modal>

      <Modal isOpen={!!viewOrder} onClose={() => setViewOrder(null)} title={`Order #${viewOrder?.id}`} size="lg">
        {viewOrder && <OrderDetailView order={viewOrder} />}
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Cancel Order" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-tertiary/10 rounded-lg">
            <Icon name="warning" fill size={20} className="text-tertiary shrink-0 mt-0.5" />
            <p className="text-sm text-on-surface">
              Cancel order <strong>#{deleteTarget?.id}</strong>? Stock levels will be automatically restored.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Keep Order</button>
            <button className="btn-primary bg-error hover:bg-red-700" onClick={handleDelete}>
              <Icon name="cancel" size={16} /> Cancel Order
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
