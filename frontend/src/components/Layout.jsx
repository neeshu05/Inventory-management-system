import { useState, useRef, useEffect, useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import Icon from './Icon'
import { searchProducts } from '../services/products'

function StockBadge({ quantity }) {
  if (quantity === 0) return <span className="badge-red">Out</span>
  if (quantity <= 10) return <span className="badge-amber">Low</span>
  return <span className="badge-green">In Stock</span>
}

function SearchBar({ autoFocus = false, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)
  const wrapperRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    searchProducts(q, 10)
      .then((r) => { setResults(r.data); setOpen(true) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    if (!val.trim()) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(() => doSearch(val), 300)
  }

  const handleKey = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      onClose?.()
    }
  }

  const handleSelect = (p) => {
    setOpen(false)
    setQuery('')
    onClose?.()
    navigate('/products', { state: { editProduct: p } })
  }

  const handleViewAll = () => {
    setOpen(false)
    setQuery('')
    onClose?.()
    navigate('/products')
  }

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <Icon name="search" size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKey}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search products by name or SKU…"
        autoFocus={autoFocus}
        className="w-full pl-10 pr-4 py-2 bg-surface-container-low border border-outline-variant rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-outline"
      />

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-outline-variant rounded-xl card-shadow z-50 overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-outline">No products found for &ldquo;{query}&rdquo;</div>
          ) : (
            <>
              <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-low">
                <span className="text-xs font-semibold text-outline uppercase tracking-wider">
                  {results.length} result{results.length !== 1 ? 's' : ''} · click to edit
                </span>
              </div>
              <ul>
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left group"
                      onClick={() => handleSelect(p)}
                    >
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                        <Icon name="inventory_2" size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{p.name}</p>
                        <p className="text-xs text-outline font-mono">{p.sku}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StockBadge quantity={p.quantity} />
                        <span className="text-sm font-semibold text-on-surface">₹{p.price.toFixed(2)}</span>
                        <Icon name="edit" size={14} className="text-outline opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-2 border-t border-outline-variant">
                <button className="text-xs text-primary font-semibold hover:underline" onClick={handleViewAll}>
                  View all in Products →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Header() {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    toast.success('Signed out')
    navigate('/login')
  }

  return (
    <header className="sticky top-0 bg-surface border-b border-outline-variant/40 z-40">
      {/* Desktop */}
      <div className="hidden md:flex h-16 items-center justify-between px-8">
        <SearchBar />
        <div className="flex items-center gap-2 ml-6">
          <div className="h-8 w-px bg-outline-variant" />
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-primary font-bold text-xs tracking-wider uppercase hover:bg-surface-container-low rounded-lg transition-all active:scale-95"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex md:hidden h-14 items-center px-4 gap-2">
        {mobileSearchOpen ? (
          <>
            <button
              onClick={() => setMobileSearchOpen(false)}
              className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors shrink-0"
            >
              <Icon name="arrow_back" size={22} />
            </button>
            <div className="flex-1">
              <SearchBar autoFocus onClose={() => setMobileSearchOpen(false)} />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shrink-0">
                <Icon name="inventory_2" fill size={16} className="text-white" />
              </div>
              <span className="font-bold text-on-surface text-[15px] truncate">InvenTrack</span>
            </div>
            <button
              onClick={() => setMobileSearchOpen(true)}
              className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors"
            >
              <Icon name="search" size={22} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors"
            >
              <Icon name="logout" size={22} />
            </button>
          </>
        )}
      </div>
    </header>
  )
}

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="md:ml-sidebar-width flex-1 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
