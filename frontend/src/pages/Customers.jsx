import { useEffect, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { useDebounce } from '../hooks/useDebounce'
import { getCustomers, searchCustomers, createCustomer, deleteCustomer } from '../services/customers'
import { getDashboardStats } from '../services/dashboard'
import BulkImportModal from '../components/BulkImportModal'

const PAGE_LIMIT = 10

function Avatar({ name }) {
  const initials = name ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?'
  const palette = [
    'bg-primary/15 text-primary', 'bg-secondary/15 text-secondary',
    'bg-tertiary/15 text-tertiary', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700',
  ]
  const color = palette[(name ? name.charCodeAt(0) : 0) % palette.length]
  return (
    <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center font-bold text-sm shrink-0`}>
      {initials}
    </div>
  )
}

function CustomerForm({ onSubmit, onCancel, saving }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ full_name: form.full_name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim() || null })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Full Name *</label>
        <input className="input" value={form.full_name} onChange={set('full_name')} required placeholder="e.g. Jane Smith" />
      </div>
      <div>
        <label className="label">Email Address *</label>
        <input className="input" type="email" value={form.email} onChange={set('email')} required placeholder="jane@company.com" />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-outline-variant">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          <Icon name="person_add" size={18} />
          {saving ? 'Saving…' : 'Add Customer'}
        </button>
      </div>
    </form>
  )
}

export default function Customers() {
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

  const [totalCustomers, setTotalCustomers] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showImport, setShowImport] = useState(false)

  const loadPage = (cur = null, paginate = false) => {
    if (paginate) setPaging(true)
    else setLoading(true)
    return getCustomers(cur, PAGE_LIMIT)
      .then((r) => {
        setItems(r.data.items)
        setNextCursor(r.data.next_cursor)
        setHasMore(r.data.has_more)
      })
      .catch((e) => toast.error(e.message))
      .finally(() => { setLoading(false); setPaging(false) })
  }

  const loadStats = () =>
    getDashboardStats().then((r) => setTotalCustomers(r.data.total_customers)).catch(() => {})

  useEffect(() => { loadPage(null); loadStats() }, [])

  useEffect(() => {
    if (!debouncedSearch.trim()) { setSearchResults(null); return }
    setSearchLoading(true)
    searchCustomers(debouncedSearch.trim(), 50)
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

  const withPhone = items.filter((c) => c.phone).length
  const thisMonth = items.filter((c) => {
    if (!c.created_at) return false
    const d = new Date(c.created_at), now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const handleAdd = async (data) => {
    setSaving(true)
    try { await createCustomer(data); toast.success('Customer added'); setAddOpen(false); reload() }
    catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try { await deleteCustomer(deleteTarget.id); toast.success('Customer removed'); setDeleteTarget(null); reload() }
    catch (e) { toast.error(e.message) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      let all = [], cur = null
      do {
        const r = await getCustomers(cur, 200)
        all = [...all, ...r.data.items]
        cur = r.data.has_more ? r.data.next_cursor : null
      } while (cur)
      const rows = all.map((c) => ({
        'Full Name': c.full_name, Email: c.email, Phone: c.phone || '',
        'Registered On': c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 18 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Customers')
      XLSX.writeFile(wb, 'customers_export.xlsx')
      toast.success(`Exported ${all.length} customers`)
    } catch (e) { toast.error(e.message) }
    finally { setExporting(false) }
  }

  const tableLoading = loading || (isSearchMode && searchLoading && searchResults === null)

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-display-md font-bold text-on-surface">Customers</h2>
          <p className="text-sm text-on-surface-variant mt-1">Manage your customer directory and contact information.</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            <Icon name="upload_file" size={18} /> Import CSV
          </button>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? <span className="w-4 h-4 border-2 border-on-surface border-t-transparent rounded-full animate-spin" /> : <Icon name="download" size={18} />}
            Export
          </button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Icon name="person_add" size={18} /> Add Customer
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="card p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
            <Icon name="group" fill size={24} className="text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-outline uppercase tracking-wider">Total Customers</p>
            <h3 className="text-[28px] font-bold leading-none mt-1 text-on-surface">{totalCustomers}</h3>
          </div>
        </div>
        <div className="card p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-secondary-container/40 rounded-lg flex items-center justify-center shrink-0">
            <Icon name="person_check" fill size={24} className="text-secondary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-outline uppercase tracking-wider">With Phone (page)</p>
            <h3 className="text-[28px] font-bold leading-none mt-1 text-on-surface">{withPhone}</h3>
          </div>
        </div>
        <div className="card p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-tertiary/10 rounded-lg flex items-center justify-center shrink-0">
            <Icon name="shopping_cart" fill size={24} className="text-tertiary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-outline uppercase tracking-wider">This Month (page)</p>
            <h3 className="text-[28px] font-bold leading-none mt-1 text-on-surface">{thisMonth}</h3>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            {isSearchMode && searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <input
              className="pl-9 pr-4 py-1.5 bg-surface-container border border-outline-variant rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all w-72 placeholder:text-outline"
              placeholder="Search by name, email or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="text-xs text-outline whitespace-nowrap">
            {isSearchMode
              ? `${displayed.length} result${displayed.length !== 1 ? 's' : ''} for "${search}"`
              : `${displayed.length} customer${displayed.length !== 1 ? 's' : ''} on this page`}
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
                      ? `No customers found for "${search}".`
                      : 'No customers yet. Click Add Customer to get started.'}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low">
                        <th className="table-th">Customer</th>
                        <th className="table-th">Email</th>
                        <th className="table-th">Phone</th>
                        <th className="table-th">Registered</th>
                        <th className="table-th text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {displayed.map((c) => (
                        <tr key={c.id} className="hover:bg-surface-container-lowest transition-colors group">
                          <td className="table-td">
                            <div className="flex items-center gap-3">
                              <Avatar name={c.full_name} />
                              <span className="font-semibold text-on-surface">{c.full_name}</span>
                            </div>
                          </td>
                          <td className="table-td text-on-surface-variant">{c.email}</td>
                          <td className="table-td text-on-surface-variant">{c.phone || <span className="text-outline">—</span>}</td>
                          <td className="table-td text-on-surface-variant text-xs">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </td>
                          <td className="table-td text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="p-1.5 hover:bg-error-container/30 rounded-lg text-error transition-colors"
                                onClick={() => setDeleteTarget(c)}
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

      <BulkImportModal entity="customers" isOpen={showImport} onClose={() => setShowImport(false)} onSuccess={reload} />

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add New Customer">
        <CustomerForm onSubmit={handleAdd} onCancel={() => setAddOpen(false)} saving={saving} />
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove Customer" size="sm">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-error-container/30 rounded-lg">
            <Icon name="warning" fill size={20} className="text-error shrink-0 mt-0.5" />
            <p className="text-sm text-on-error-container">
              Remove <strong>{deleteTarget?.full_name}</strong>? All associated orders will also be deleted.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn-primary bg-error hover:bg-red-700" onClick={handleDelete}>
              <Icon name="delete" size={16} /> Remove
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
