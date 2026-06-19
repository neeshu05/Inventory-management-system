import { useState, useRef } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import { bulkCreateProducts, bulkCreateCustomers, bulkCreateOrders } from '../services/bulk'

// ── Lightweight CSV parser (handles quoted fields) ───────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []

  const splitLine = (line) => {
    const cols = []
    let cur = '', inQ = false
    for (let c of line) {
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += c }
    }
    cols.push(cur.trim())
    return cols
  }

  const headers = splitLine(lines[0])
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const vals = splitLine(line)
    return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i] ?? '' }), {})
  })
}

// ── Per-entity configuration ─────────────────────────────────────────────────
const CONFIGS = {
  products: {
    label: 'Products',
    headers: ['name', 'sku', 'price', 'quantity', 'description'],
    previewCols: ['name', 'sku', 'price', 'quantity'],
    templateRows: [
      ['Laptop Pro', 'LAP-001', '999.99', '50', 'High-end laptop'],
      ['USB Mouse', 'MOUSE-001', '29.99', '100', ''],
    ],
    hint: null,
    validate(rows) {
      const errs = []
      rows.forEach((r, i) => {
        const n = i + 2
        if (!r.name?.trim()) errs.push({ row: n, error: 'Name is required' })
        else if (!r.sku?.trim()) errs.push({ row: n, error: 'SKU is required' })
        else if (isNaN(parseFloat(r.price)) || parseFloat(r.price) < 0) errs.push({ row: n, error: 'Invalid price' })
        else if (isNaN(parseInt(r.quantity, 10)) || parseInt(r.quantity, 10) < 0) errs.push({ row: n, error: 'Invalid quantity' })
      })
      return errs
    },
    transform(rows) {
      return rows.map((r) => ({
        name: r.name.trim(),
        sku: r.sku.trim().toUpperCase(),
        price: parseFloat(r.price),
        quantity: parseInt(r.quantity, 10),
        description: r.description?.trim() || null,
      }))
    },
    apiCall: bulkCreateProducts,
    countLabel: (n) => `${n} product${n !== 1 ? 's' : ''}`,
  },

  customers: {
    label: 'Customers',
    headers: ['full_name', 'email', 'phone'],
    previewCols: ['full_name', 'email', 'phone'],
    templateRows: [
      ['Jane Smith', 'jane@example.com', '+1 555 000 1234'],
      ['John Doe', 'john@example.com', ''],
    ],
    hint: null,
    validate(rows) {
      const errs = []
      rows.forEach((r, i) => {
        const n = i + 2
        if (!r.full_name?.trim()) errs.push({ row: n, error: 'full_name is required' })
        else if (!r.email?.trim() || !r.email.includes('@')) errs.push({ row: n, error: 'Valid email is required' })
      })
      return errs
    },
    transform(rows) {
      return rows.map((r) => ({
        full_name: r.full_name.trim(),
        email: r.email.trim().toLowerCase(),
        phone: r.phone?.trim() || null,
      }))
    },
    apiCall: bulkCreateCustomers,
    countLabel: (n) => `${n} customer${n !== 1 ? 's' : ''}`,
  },

  orders: {
    label: 'Orders',
    headers: ['order_id', 'customer_email', 'product_sku', 'quantity'],
    previewCols: ['order_id', 'customer_email', 'product_sku', 'quantity'],
    templateRows: [
      ['1', 'jane@example.com', 'LAP-001', '2'],
      ['1', 'jane@example.com', 'MOUSE-001', '1'],
      ['2', 'john@example.com', 'DESK-001', '1'],
    ],
    hint: 'Rows sharing the same order_id are grouped into one order.',
    validate(rows) {
      const errs = []
      rows.forEach((r, i) => {
        const n = i + 2
        if (!r.order_id?.trim()) errs.push({ row: n, error: 'order_id is required' })
        else if (!r.customer_email?.trim() || !r.customer_email.includes('@')) errs.push({ row: n, error: 'Valid customer_email is required' })
        else if (!r.product_sku?.trim()) errs.push({ row: n, error: 'product_sku is required' })
        else if (isNaN(parseInt(r.quantity, 10)) || parseInt(r.quantity, 10) <= 0) errs.push({ row: n, error: 'quantity must be a positive integer' })
      })
      return errs
    },
    transform(rows) {
      const groups = {}
      rows.forEach((r) => {
        const id = r.order_id?.trim()
        if (!id) return
        if (!groups[id]) groups[id] = { customer_email: r.customer_email.trim().toLowerCase(), items: [] }
        const qty = parseInt(r.quantity, 10)
        if (r.product_sku?.trim() && !isNaN(qty) && qty > 0) {
          groups[id].items.push({ product_sku: r.product_sku.trim().toUpperCase(), quantity: qty })
        }
      })
      return Object.values(groups).filter((o) => o.items.length > 0)
    },
    apiCall: bulkCreateOrders,
    countLabel: (n) => `${n} order${n !== 1 ? 's' : ''}`,
  },
}

// ── Component ────────────────────────────────────────────────────────────────
export default function BulkImportModal({ entity, isOpen, onClose, onSuccess }) {
  const cfg = CONFIGS[entity]
  const fileRef = useRef(null)

  const [stage, setStage] = useState('upload')  // upload | preview | result
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [validationErrors, setValidationErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const reset = () => {
    setStage('upload')
    setDragging(false)
    setFileName('')
    setRows([])
    setValidationErrors([])
    setImporting(false)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => { reset(); onClose() }

  // Download CSV template
  const downloadTemplate = () => {
    const header = cfg.headers.join(',')
    const examples = cfg.templateRows.map((r) => r.map((v) => (v.includes(',') ? `"${v}"` : v)).join(','))
    const csv = [header, ...examples].join('\n') + '\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${entity}_template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Parse uploaded file
  const processFile = (file) => {
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a .csv file.')
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result)
      if (parsed.length === 0) {
        alert('The CSV is empty or has no data rows.')
        return
      }
      const errs = cfg.validate(parsed)
      setRows(parsed)
      setValidationErrors(errs)
      setStage('preview')
    }
    reader.readAsText(file)
  }

  const handleFileInput = (e) => processFile(e.target.files?.[0])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files?.[0])
  }

  // Import
  const handleImport = async () => {
    setImporting(true)
    try {
      const payload = cfg.transform(rows)
      const res = await cfg.apiCall(payload)
      setResult(res.data)
      setStage('result')
      if (res.data.created > 0) onSuccess()
    } catch (e) {
      alert(e.message)
    } finally {
      setImporting(false)
    }
  }

  const transformedCount = stage === 'preview'
    ? (entity === 'orders' ? cfg.transform(rows).length : rows.length)
    : 0

  // ── Render stages ──────────────────────────────────────────────────────────
  const renderUpload = () => (
    <div className="space-y-5">
      {/* Template download */}
      <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <div>
          <p className="text-sm font-semibold text-on-surface">Download template first</p>
          <p className="text-xs text-outline mt-0.5">Fill it in, then upload below.</p>
        </div>
        <button onClick={downloadTemplate} className="btn-secondary text-sm flex items-center gap-2 shrink-0">
          <Icon name="download" size={16} />
          Template CSV
        </button>
      </div>

      {/* Drag & drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-outline-variant hover:border-primary/50 hover:bg-surface-container-low'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
        <div className="w-14 h-14 bg-surface-container rounded-full flex items-center justify-center">
          <Icon name="upload_file" size={28} className={dragging ? 'text-primary' : 'text-outline'} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-on-surface">
            {dragging ? 'Drop it here' : 'Drag & drop your CSV'}
          </p>
          <p className="text-xs text-outline mt-1">or click to browse · .csv only</p>
        </div>
      </div>

      {/* Format hint */}
      <div className="text-xs text-outline space-y-1">
        <p className="font-semibold text-on-surface-variant">Expected columns:</p>
        <p className="font-mono bg-surface-container rounded-lg px-3 py-2">
          {cfg.headers.join(', ')}
        </p>
        {cfg.hint && <p className="text-outline mt-1">💡 {cfg.hint}</p>}
      </div>
    </div>
  )

  const renderPreview = () => {
    const SHOW_MAX = 8
    const displayRows = rows.slice(0, SHOW_MAX)
    const more = rows.length - SHOW_MAX

    return (
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-on-surface">
              {entity === 'orders'
                ? `${rows.length} CSV row${rows.length !== 1 ? 's' : ''} → ${transformedCount} order${transformedCount !== 1 ? 's' : ''}`
                : `${rows.length} row${rows.length !== 1 ? 's' : ''} to import`}
            </p>
            <p className="text-xs text-outline mt-0.5">{fileName}</p>
          </div>
          {validationErrors.length === 0 && (
            <span className="badge-green">Ready to import</span>
          )}
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="bg-error-container/20 border border-error/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Icon name="error" fill size={16} className="text-error" />
              <p className="text-sm font-semibold text-error">{validationErrors.length} validation error{validationErrors.length !== 1 ? 's' : ''}</p>
            </div>
            <ul className="space-y-1">
              {validationErrors.slice(0, 5).map((e, i) => (
                <li key={i} className="text-xs text-on-error-container">
                  <span className="font-mono font-semibold">Row {e.row}:</span> {e.error}
                </li>
              ))}
              {validationErrors.length > 5 && (
                <li className="text-xs text-outline">…and {validationErrors.length - 5} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Preview table */}
        <div className="border border-outline-variant rounded-xl overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-container-low">
                  <th className="table-th text-outline w-10">#</th>
                  {cfg.previewCols.map((h) => (
                    <th key={h} className="table-th capitalize">{h.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {displayRows.map((row, i) => (
                  <tr key={i} className="hover:bg-surface-container-lowest">
                    <td className="table-td text-outline font-mono">{i + 2}</td>
                    {cfg.previewCols.map((h) => (
                      <td key={h} className="table-td text-on-surface-variant max-w-[140px] truncate">
                        {row[h] || <span className="text-outline">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {more > 0 && (
            <div className="px-4 py-2 border-t border-outline-variant bg-surface-container-low">
              <p className="text-xs text-outline">… and {more} more row{more !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-2 border-t border-outline-variant">
          <button className="btn-secondary" onClick={reset}>
            <Icon name="arrow_back" size={16} /> Back
          </button>
          <button
            className="btn-primary"
            disabled={validationErrors.length > 0 || importing}
            onClick={handleImport}
          >
            {importing ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Icon name="upload" size={16} />
                Import {cfg.countLabel(entity === 'orders' ? transformedCount : rows.length)}
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  const renderResult = () => {
    const { created, failed, errors } = result
    return (
      <div className="space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <Icon name="check_circle" fill size={22} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{created}</p>
              <p className="text-xs text-green-600 font-medium">Created</p>
            </div>
          </div>
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${failed > 0 ? 'bg-error-container/20 border-error/20' : 'bg-surface-container border-outline-variant'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${failed > 0 ? 'bg-error-container/40' : 'bg-surface-container-low'}`}>
              <Icon name={failed > 0 ? 'error' : 'check'} fill size={22} className={failed > 0 ? 'text-error' : 'text-outline'} />
            </div>
            <div>
              <p className={`text-2xl font-bold ${failed > 0 ? 'text-error' : 'text-outline'}`}>{failed}</p>
              <p className={`text-xs font-medium ${failed > 0 ? 'text-error' : 'text-outline'}`}>Failed</p>
            </div>
          </div>
        </div>

        {/* Error details */}
        {errors.length > 0 && (
          <div className="border border-outline-variant rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-outline-variant bg-surface-container-low">
              <p className="text-xs font-semibold text-outline uppercase tracking-wider">Import Errors</p>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-outline-variant">
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-xs font-mono font-semibold text-outline shrink-0 mt-0.5">#{e.row}</span>
                  <p className="text-xs text-on-surface-variant">{e.error}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-2 border-t border-outline-variant">
          <button className="btn-secondary" onClick={reset}>
            <Icon name="upload_file" size={16} /> Import More
          </button>
          <button className="btn-primary" onClick={handleClose}>
            Done
          </button>
        </div>
      </div>
    )
  }

  const titles = { upload: `Import ${cfg.label}`, preview: 'Preview Import', result: 'Import Complete' }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={titles[stage]} size="lg">
      {stage === 'upload' && renderUpload()}
      {stage === 'preview' && renderPreview()}
      {stage === 'result' && renderResult()}
    </Modal>
  )
}
