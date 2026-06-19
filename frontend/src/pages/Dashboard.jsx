import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { getDashboardStats, getDashboardTrends, getLowStockProducts } from '../services/dashboard'
import Icon from '../components/Icon'

function StatCard({ label, value, icon, iconBg, iconColor, valueColor = 'text-on-surface' }) {
  return (
    <div className="card p-4 md:p-6 flex items-center gap-3 md:gap-4">
      <div className={`w-10 h-10 md:w-12 md:h-12 ${iconBg} rounded-lg flex items-center justify-center shrink-0`}>
        <Icon name={icon} fill size={20} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] md:text-xs font-semibold text-outline uppercase tracking-wider leading-tight">{label}</p>
        <h3 className={`text-[22px] md:text-[28px] font-bold leading-none mt-1 ${valueColor}`}>{value}</h3>
      </div>
    </div>
  )
}

function WeeklyTrailChart({ labels, values, mode, todayIdx }) {
  const [tooltip, setTooltip] = useState(null)
  const W = 560, H = 180, PAD = { top: 16, right: 16, bottom: 32, left: 40 }
  const n = values.length
  const maxVal = Math.max(...values, 1)

  if (n === 0) {
    return (
      <div className="h-56 bg-surface-container-low rounded-lg flex items-center justify-center text-sm text-outline">
        No data for this week
      </div>
    )
  }

  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const px = (i) => PAD.left + (i / (n - 1)) * iW
  const py = (v) => PAD.top + iH - (v / maxVal) * iH

  const points = values.map((v, i) => [px(i), py(v)])
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const areaPath = `${linePath} L${px(n - 1)},${PAD.top + iH} L${px(0)},${PAD.top + iH} Z`

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    val: Math.round(maxVal * f),
    y: py(maxVal * f),
  }))

  const fmt = (v) => mode === 'revenue'
    ? (v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`)
    : String(v)

  return (
    <div className="relative bg-surface-container-low rounded-lg overflow-visible">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: '210px' }}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="trail-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#004ac6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#004ac6" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {ticks.map(({ val, y }) => (
          <g key={val}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#c3c6d7" strokeWidth="1" strokeDasharray="4,3" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#737686">{fmt(val)}</text>
          </g>
        ))}

        <path d={areaPath} fill="url(#trail-grad)" />
        <path d={linePath} fill="none" stroke="#004ac6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {labels.map((lbl, i) => (
          <text
            key={i}
            x={px(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fill={i === todayIdx ? '#004ac6' : '#737686'}
            fontWeight={i === todayIdx ? '700' : '400'}
          >
            {lbl}
          </text>
        ))}

        {points.map(([x, y], i) => (
          <g key={i} onMouseEnter={() => setTooltip({ i, x, y, val: values[i], lbl: labels[i] })}>
            <circle cx={x} cy={y} r="12" fill="transparent" />
            <circle
              cx={x} cy={y} r={i === todayIdx ? 5.5 : 3.5}
              fill={i === todayIdx ? '#004ac6' : '#fff'}
              stroke="#004ac6"
              strokeWidth="2"
            />
          </g>
        ))}

        {tooltip && (() => {
          const TW = 84, TH = 44
          const tx = Math.min(Math.max(tooltip.x, TW / 2 + 4), W - TW / 2 - 4)
          // Flip below the dot when too close to the top edge
          const above = tooltip.y > TH + 16
          const boxY = above ? tooltip.y - TH - 8 : tooltip.y + 12
          const valueLabel = mode === 'revenue'
            ? `₹${tooltip.val.toLocaleString('en-IN')}`
            : `${tooltip.val} order${tooltip.val !== 1 ? 's' : ''}`
          return (
            <g>
              <rect x={tx - TW / 2} y={boxY} width={TW} height={TH} rx="6" fill="#191c1e" opacity="0.93" />
              <text x={tx} y={boxY + 15} textAnchor="middle" fontSize="9" fill="#9ba1b0">{tooltip.lbl}</text>
              <text x={tx} y={boxY + 33} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">{valueLabel}</text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

const LOW_STOCK_PAGE = 5

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [trends, setTrends] = useState(null)
  const [loading, setLoading] = useState(true)
  const [chartMode, setChartMode] = useState('orders')
  const [weekOffset, setWeekOffset] = useState(0)
  const [trendsLoading, setTrendsLoading] = useState(false)

  const [lowStockItems, setLowStockItems] = useState([])
  const [lowStockTotal, setLowStockTotal] = useState(0)
  const [lowStockSkip, setLowStockSkip] = useState(0)
  const [lowStockPaging, setLowStockPaging] = useState(false)
  const [exportingLowStock, setExportingLowStock] = useState(false)

  const handleExportLowStock = async () => {
    setExportingLowStock(true)
    try {
      const r = await getLowStockProducts(0, 10000)
      const rows = r.data.items.map((p) => ({
        SKU: p.sku,
        'Product Name': p.name,
        'Unit Price (₹)': p.price,
        'Stock Level': p.quantity,
        Status: p.quantity === 0 ? 'Out of Stock' : 'Low Stock',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 14 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Low Stock')
      XLSX.writeFile(wb, 'low_stock_alert.xlsx')
      toast.success(`Exported ${rows.length} items`)
    } catch (e) { toast.error(e.message) }
    finally { setExportingLowStock(false) }
  }

  const fetchLowStock = (skip = 0, paginate = false) => {
    if (paginate) setLowStockPaging(true)
    getLowStockProducts(skip, LOW_STOCK_PAGE)
      .then((r) => { setLowStockItems(r.data.items); setLowStockTotal(r.data.total) })
      .catch(() => {})
      .finally(() => setLowStockPaging(false))
  }

  useEffect(() => {
    Promise.all([getDashboardStats(), getDashboardTrends(0)])
      .then(([s, t]) => { setStats(s.data); setTrends(t.data) })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
    fetchLowStock(0)
  }, [])

  const fetchWeek = (offset) => {
    setTrendsLoading(true)
    getDashboardTrends(offset)
      .then((r) => setTrends(r.data))
      .catch((e) => toast.error(e.message))
      .finally(() => setTrendsLoading(false))
  }

  const goPrevWeek = () => {
    const next = weekOffset - 1
    setWeekOffset(next)
    fetchWeek(next)
  }

  const goNextWeek = () => {
    if (weekOffset >= 0) return
    const next = weekOffset + 1
    setWeekOffset(next)
    fetchWeek(next)
  }

  const weekLabel = weekOffset === 0
    ? 'This Week'
    : weekOffset === -1
    ? 'Last Week'
    : `${Math.abs(weekOffset)} Weeks Ago`

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin w-9 h-9 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )

  const lowStockCount  = stats?.low_stock_count ?? 0
  const outOfStockCount = stats?.out_of_stock_count ?? 0
  const totalLowStock  = lowStockCount + outOfStockCount
  const totalCustomers = stats?.total_customers ?? 0
  const lowStockPage   = Math.floor(lowStockSkip / LOW_STOCK_PAGE) + 1
  const lowStockPages  = Math.ceil(lowStockTotal / LOW_STOCK_PAGE) || 1

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-display-md font-bold text-on-surface">Dashboard</h2>
        <p className="text-sm text-on-surface-variant mt-1">Overview of your inventory and business metrics.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <StatCard label="Total Products"  value={stats?.total_products ?? 0}  icon="inventory_2"    iconBg="bg-primary/10"             iconColor="text-primary" />
        <StatCard label="Low Stock"       value={lowStockCount}                icon="warning"        iconBg="bg-tertiary/10"            iconColor="text-tertiary"   valueColor="text-tertiary" />
        <StatCard label="Out of Stock"    value={outOfStockCount}              icon="block"          iconBg="bg-error-container/40"     iconColor="text-error"      valueColor="text-error" />
        <StatCard label="Total Orders"    value={stats?.total_orders ?? 0}     icon="shopping_cart"  iconBg="bg-secondary-container/40" iconColor="text-secondary" />
      </div>

      {/* Low stock alerts */}
      {totalLowStock > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-outline-variant flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-[17px] font-semibold text-on-surface">Low Stock Alerts</h3>
            <div className="flex items-center gap-3">
              <span className="badge-amber">{totalLowStock} items need attention</span>
              <button
                className="btn-secondary py-1 px-3 text-sm"
                onClick={handleExportLowStock}
                disabled={exportingLowStock}
              >
                {exportingLowStock
                  ? <span className="w-3.5 h-3.5 border-2 border-on-surface border-t-transparent rounded-full animate-spin" />
                  : <Icon name="download" size={16} />}
                Export
              </button>
            </div>
          </div>

          <div className="relative">
            <div className={`transition-opacity duration-150 ${lowStockPaging ? 'opacity-40' : 'opacity-100'}`}>
              {/* Mobile card list */}
              <div className="block sm:hidden divide-y divide-outline-variant">
                {lowStockItems.map((p) => (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{p.name}</p>
                      <p className="text-xs font-mono text-outline">{p.sku}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-bold ${p.quantity === 0 ? 'text-error' : 'text-on-surface'}`}>
                        {p.quantity}u
                      </span>
                      {p.quantity === 0
                        ? <span className="badge-red">Out</span>
                        : <span className="badge-amber">Low</span>}
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto custom-scrollbar">
                <table className="w-full">
                  <thead className="bg-surface-container-low">
                    <tr>
                      <th className="table-th">SKU</th>
                      <th className="table-th">Product Name</th>
                      <th className="table-th">Unit Price</th>
                      <th className="table-th">Stock Level</th>
                      <th className="table-th">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {lowStockItems.map((p) => (
                      <tr key={p.id} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="table-td font-semibold text-outline">{p.sku}</td>
                        <td className="table-td font-semibold text-on-surface">{p.name}</td>
                        <td className="table-td">₹{p.price.toFixed(2)}</td>
                        <td className={`table-td font-bold ${p.quantity === 0 ? 'text-error' : 'text-on-surface'}`}>
                          {p.quantity} units
                        </td>
                        <td className="table-td">
                          {p.quantity === 0
                            ? <span className="badge-red">Out of Stock</span>
                            : <span className="badge-amber">Low Stock</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {lowStockPaging && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="animate-spin w-6 h-6 border-[3px] border-primary border-t-transparent rounded-full" />
              </div>
            )}
          </div>

          {lowStockPages > 1 && (
            <div className="px-6 py-3 border-t border-outline-variant flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 border border-outline-variant rounded-lg text-sm hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  disabled={lowStockSkip === 0 || lowStockPaging}
                  onClick={() => {
                    const s = Math.max(0, lowStockSkip - LOW_STOCK_PAGE)
                    setLowStockSkip(s); fetchLowStock(s, true)
                  }}
                >
                  <Icon name="chevron_left" size={15} /> Prev
                </button>
                <button
                  className="px-3 py-1.5 border border-outline-variant rounded-lg text-sm hover:bg-surface-container-low transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  disabled={lowStockSkip + LOW_STOCK_PAGE >= lowStockTotal || lowStockPaging}
                  onClick={() => {
                    const s = lowStockSkip + LOW_STOCK_PAGE
                    setLowStockSkip(s); fetchLowStock(s, true)
                  }}
                >
                  Next <Icon name="chevron_right" size={15} />
                </button>
              </div>
              <p className="text-xs text-outline">Page {lowStockPage} of {lowStockPages}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom — chart + quick stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-[17px] font-semibold text-on-surface">
                {chartMode === 'orders' ? 'Orders' : 'Revenue'} · {trends?.week_label ?? '—'}
              </h3>
              <p className="text-xs text-outline mt-0.5">{weekLabel} · Mon – Sun</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Week navigation */}
              <div className="flex items-center border border-outline-variant rounded-lg overflow-hidden">
                <button
                  onClick={goPrevWeek}
                  className="p-1.5 hover:bg-surface-container transition-colors"
                  title="Previous week"
                >
                  <Icon name="chevron_left" size={18} className="text-on-surface-variant" />
                </button>
                <span className="px-2 text-xs font-semibold text-outline min-w-[72px] text-center">
                  {trendsLoading ? '…' : weekLabel}
                </span>
                <button
                  onClick={goNextWeek}
                  disabled={weekOffset >= 0}
                  className="p-1.5 hover:bg-surface-container transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next week"
                >
                  <Icon name="chevron_right" size={18} className="text-on-surface-variant" />
                </button>
              </div>
              {/* Orders / Revenue toggle */}
              <div className="flex gap-1 bg-surface-container-low rounded-lg p-0.5">
                {['orders', 'revenue'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setChartMode(m)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      chartMode === m
                        ? 'bg-white text-primary card-shadow'
                        : 'text-outline hover:text-on-surface'
                    }`}
                  >
                    {m === 'revenue' ? 'Revenue (₹)' : 'Orders'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <WeeklyTrailChart
            labels={trends?.labels ?? []}
            values={trends ? (chartMode === 'orders' ? trends.order_counts : trends.revenue) : []}
            mode={chartMode}
            todayIdx={trends?.today_idx ?? -1}
          />
        </div>

        {/* Quick stats */}
        <div className="card p-6">
          <h3 className="text-[17px] font-semibold text-on-surface mb-4">Quick Stats</h3>
          <div className="space-y-4">
            {[
              { dot: 'bg-primary',    title: 'Total Products',     sub: `${stats?.total_products ?? 0} products registered` },
              { dot: 'bg-green-500',  title: 'Total Customers',    sub: `${totalCustomers} customers registered` },
              { dot: 'bg-tertiary',   title: 'Low Stock Warnings', sub: `${lowStockCount} products need restocking` },
              { dot: 'bg-error',      title: 'Out of Stock',       sub: `${outOfStockCount} products unavailable` },
            ].map(({ dot, title, sub }) => (
              <div key={title} className="flex items-start gap-3">
                <div className={`mt-1.5 w-2 h-2 rounded-full ${dot} shrink-0`} />
                <div>
                  <p className="text-sm font-medium text-on-surface">{title}</p>
                  <p className="text-xs text-outline mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
