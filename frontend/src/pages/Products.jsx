import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { useDebounce } from '../hooks/useDebounce'
import { getProducts, searchProducts, createProduct, updateProduct, deleteProduct } from '../services/products'
import { getDashboardStats } from '../services/dashboard'
import BulkImportModal from '../components/BulkImportModal'

const PAGE_LIMIT = 10

function StockBadge({ quantity }) {
  if (quantity === 0) return <span className="badge-red">Out of Stock</span>
  if (quantity <= 10) return <span className="badge-amber">Low Stock</span>
  return <span className="badge-green">In Stock</span>
}

function StatCard({ label, value, icon, iconBg, iconColor, valueColor = 'text-on-surface' }) {
  return (
    <div className="card p-6 flex items-center gap-4">
      <div className={`w-12 h-12 ${iconBg} rounded-lg flex items-center justify-center shrink-0`}>
        <Icon name={icon} fill size={24} className={iconColor} />
      </div>
      <div>
        <p className="text-xs font-semibold text-outline uppercase tracking-wider">{label}</p>
        <h3 className={`text-[28px] font-bold leading-none mt-1 ${valueColor}`}>{value}</h3>
      </div>
    </div>
  )
}

const emptyForm = { name: '', sku: '', price: '', quantity: '', description: '' }

function ProductForm({ initial = emptyForm, onSubmit, onCancel, saving }) {
  const [form, setForm] = useState({ ...initial, price: initial.price ?? '', quantity: initial.quantity ?? '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ name: form.name.trim(), sku: form.sku.trim(), price: parseFloat(form.price), quantity: parseInt(form.quantity, 10), description: form.description?.trim() || null })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Product Name *</label>
          <input className="input" value={form.name} onChange={set('name')} required placeholder="e.g. Laptop Pro" />
        </div>
        <div>
          <label className="label">SKU *</label>
          <input className="input font-mono" value={form.sku} onChange={set('sku')} required placeholder="e.g. LAP-001" />
        </div>
        <div>
          <label className="label">Price (₹) *</label>
          <input className="input" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} required placeholder="0.00" />
        </div>
        <div>
          <label className="label">Quantity *</label>
          <input className="input" type="number" min="0" value={form.quantity} onChange={set('quantity')} required placeholder="0" />
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input resize-none" rows={3} value={form.description || ''} onChange={set('description')} placeholder="Optional product description" />
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-outline-variant">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          <Icon name="save" size={18} />
          {saving ? 'Saving…' : 'Save Product'}
        </button>
      </div>
    </form>
  )
}

export default function Products() {
  const location = useLocation()
  const navigate = useNavigate()

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

  const [statusFilter, setStatusFilter] = useState('all')
  const isFirstRender = useRef(true)
  const [dashStats, setDashStats] = useState(null)
  const [modal, setModal] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showImport, setShowImport] = useState(false)

  const loadPage = (cur = null, paginate = false, status = statusFilter) => {
    if (paginate) setPaging(true)
    else setLoading(true)
    return getProducts(cur, PAGE_LIMIT, status)
      .then((r) => {
        setItems(r.data.items)
        setNextCursor(r.data.next_cursor)
        setHasMore(r.data.has_more)
      })
      .catch((e) => toast.error(e.message))
      .finally(() => { setLoading(false); setPaging(false) })
  }

  const loadStats = () =>
    getDashboardStats().then((r) => setDashStats(r.data)).catch(() => {})

  useEffect(() => { loadPage(null, false, statusFilter); loadStats() }, [])

  // Re-fetch from page 1 when status filter changes (skip initial mount)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setCursorStack([])
    setCursor(null)
    loadPage(null, false, statusFilter)
  }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open in edit mode when navigated from global search
  useEffect(() => {
    const ep = location.state?.editProduct
    if (ep) {
      setModal({ type: 'edit', product: ep })
      navigate(location.pathname, { replace: true, state: null })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Server-side search with debounce
  useEffect(() => {
    if (!debouncedSearch.trim()) { setSearchResults(null); return }
    setSearchLoading(true)
    searchProducts(debouncedSearch.trim(), 50)
      .then((r) => setSearchResults(r.data))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false))
  }, [debouncedSearch])

  const goNext = () => {
    setCursorStack((s) => [...s, cursor])
    setCursor(nextCursor)
    loadPage(nextCursor, true, statusFilter)
  }

  const goPrev = () => {
    const stack = [...cursorStack]
    const prev = stack.pop() ?? null
    setCursorStack(stack)
    setCursor(prev)
    loadPage(prev, true, statusFilter)
  }

  const reload = () => {
    setCursorStack([])
    setCursor(null)
    setSearch('')
    setSearchResults(null)
    loadPage(null, false, statusFilter)
    loadStats()
  }

  const isSearchMode = search.trim().length > 0
  const filtered = isSearchMode ? (searchResults ?? []) : items

  const statTotal = dashStats?.total_products ?? 0
  const statLow   = dashStats?.low_stock_count ?? 0
  const statOut   = dashStats?.out_of_stock_count ?? 0
  const pageValue = items.reduce((s, p) => s + p.price * p.quantity, 0)

  const handleAdd = async (data) => {
    setSaving(true)
    try { await createProduct(data); toast.success('Product created'); setModal(null); reload() }
    catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const handleEdit = async (data) => {
    setSaving(true)
    try { await updateProduct(modal.product.id, data); toast.success('Product updated'); setModal(null); reload() }
    catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try { await deleteProduct(deleteTarget.id); toast.success('Product deleted'); setDeleteTarget(null); reload() }
    catch (e) { toast.error(e.message) }
  }

  const clearFilters = () => {
    setSearch('')
    if (statusFilter !== 'all') setStatusFilter('all')
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      let all = [], cur = null
      do {
        const r = await getProducts(cur, 200, statusFilter)
        all = [...all, ...r.data.items]
        cur = r.data.has_more ? r.data.next_cursor : null
      } while (cur)

      const rows = all.map((p) => ({
        Name: p.name, SKU: p.sku, 'Price (₹)': p.price, Quantity: p.quantity,
        Status: p.quantity === 0 ? 'Out of Stock' : p.quantity <= 10 ? 'Low Stock' : 'In Stock',
        Description: p.description || '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 36 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Products')
      XLSX.writeFile(wb, 'products_export.xlsx')
      toast.success(`Exported ${all.length} products`)
    } catch (e) { toast.error(e.message) }
    finally { setExporting(false) }
  }

  const tableLoading = loading || (isSearchMode && searchLoading && searchResults === null)

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-display-md font-bold text-on-surface">Product Inventory</h2>
          <p className="text-sm text-on-surface-variant mt-1">Manage and track your warehouse stock levels in real-time.</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            <Icon name="upload_file" size={18} /> Import CSV
          </button>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? <span className="w-4 h-4 border-2 border-on-surface border-t-transparent rounded-full animate-spin" /> : <Icon name="download" size={18} />}
            Export
          </button>
          <button className="btn-primary" onClick={() => setModal('add')}>
            <Icon name="add" size={18} /> Add Product
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Products" value={statTotal}  icon="inventory_2"    iconBg="bg-primary/10"             iconColor="text-primary" />
        <StatCard label="Low Stock"      value={statLow}    icon="warning"        iconBg="bg-tertiary/10"            iconColor="text-tertiary"   valueColor="text-tertiary" />
        <StatCard label="Out of Stock"   value={statOut}    icon="block"          iconBg="bg-error-container/40"     iconColor="text-error"      valueColor="text-error" />
        <StatCard label="Page Value"     value={`₹${pageValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} icon="payments" iconBg="bg-secondary-container/40" iconColor="text-secondary" />
      </div>

      {/* Table card */}
      <div className="card overflow-hidden">
        {/* Filters row */}
        <div className="px-6 py-4 border-b border-outline-variant flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              {isSearchMode && searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <input
                className="pl-9 pr-4 py-1.5 bg-surface-container border border-outline-variant rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all w-64 placeholder:text-outline"
                placeholder="Search products by name or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container rounded-lg border border-outline-variant">
              <span className="text-xs font-semibold text-outline uppercase">Status:</span>
              <select
                className="bg-transparent border-none focus:ring-0 text-sm p-0 cursor-pointer text-on-surface outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
            {(search || statusFilter !== 'all') && (
              <button onClick={clearFilters} className="text-primary text-xs font-semibold hover:underline">
                Clear Filters
              </button>
            )}
          </div>
          <p className="text-xs text-outline whitespace-nowrap">
            {isSearchMode
              ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${search}"`
              : `${filtered.length} product${filtered.length !== 1 ? 's' : ''} on this page`}
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto custom-scrollbar relative">
          {tableLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              <div className={`transition-opacity duration-150 ${paging ? 'opacity-40' : 'opacity-100'}`}>
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-on-surface-variant text-sm">
                    {isSearchMode
                      ? `No products found for "${search}".`
                      : statusFilter !== 'all'
                      ? 'No products match your filters.'
                      : 'No products yet. Click Add Product to get started.'}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low">
                        <th className="table-th">SKU</th>
                        <th className="table-th">Product Name</th>
                        <th className="table-th">Description</th>
                        <th className="table-th">Stock Level</th>
                        <th className="table-th">Status</th>
                        <th className="table-th text-right">Unit Price</th>
                        <th className="table-th text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {filtered.map((p) => (
                        <tr key={p.id} className="hover:bg-surface-container-lowest transition-colors group">
                          <td className="table-td font-semibold text-outline font-mono text-xs">{p.sku}</td>
                          <td className="table-td"><p className="font-semibold text-on-surface">{p.name}</p></td>
                          <td className="table-td text-on-surface-variant max-w-[200px] truncate">{p.description || '—'}</td>
                          <td className={`table-td font-bold ${p.quantity === 0 ? 'text-error' : 'text-on-surface'}`}>
                            {p.quantity} units
                          </td>
                          <td className="table-td"><StockBadge quantity={p.quantity} /></td>
                          <td className="table-td text-right font-semibold">₹{p.price.toFixed(2)}</td>
                          <td className="table-td text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface-variant transition-colors"
                                onClick={() => setModal({ type: 'edit', product: p })}
                                title="Edit"
                              >
                                <Icon name="edit" size={18} />
                              </button>
                              <button
                                className="p-1.5 hover:bg-error-container/30 rounded-lg text-error transition-colors"
                                onClick={() => setDeleteTarget(p)}
                                title="Delete"
                              >
                                <Icon name="delete" size={18} />
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
            <p className="text-xs text-outline">
              Page {cursorStack.length + 1} · {PAGE_LIMIT} per page
            </p>
          </div>
        )}
      </div>

      <BulkImportModal entity="products" isOpen={showImport} onClose={() => setShowImport(false)} onSuccess={reload} />

      <Modal isOpen={modal === 'add'} onClose={() => setModal(null)} title="Add New Product">
        <ProductForm onSubmit={handleAdd} onCancel={() => setModal(null)} saving={saving} />
      </Modal>

      <Modal isOpen={modal?.type === 'edit'} onClose={() => setModal(null)} title="Edit Product">
        {modal?.type === 'edit' && (
          <ProductForm initial={modal.product} onSubmit={handleEdit} onCancel={() => setModal(null)} saving={saving} />
        )}
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Product" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-error-container/30 rounded-lg">
            <Icon name="warning" fill size={20} className="text-error shrink-0 mt-0.5" />
            <p className="text-sm text-on-error-container">Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn-primary bg-error hover:bg-red-700" onClick={handleDelete}>
              <Icon name="delete" size={16} /> Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
