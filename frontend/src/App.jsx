import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

// Lazy-loaded the page components for code splitting
// Each page is loaded only when needed, improving initial load performance

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Products  = lazy(() => import('./pages/Products'))
const Customers = lazy(() => import('./pages/Customers'))
const Orders    = lazy(() => import('./pages/Orders'))
const Login     = lazy(() => import('./pages/Login'))
const Register  = lazy(() => import('./pages/Register'))

// Page Spinner component is displayed while lazy-loaded components are being fetched
function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin w-9 h-9 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  )
}

// Main application component with routing configuration.
 
export default function App() {
  return (
    // Suspense wrapper for lazy loading with fallback spinner during loading states
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        {/* Public routes - accessible without authentication */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes - requires authentication */}
        <Route element={<ProtectedRoute />}>
          {/* Layout wrapper for authenticated pages */}
          <Route element={<Layout />}>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/products"  element={<Products />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/orders"    element={<Orders />} />
          </Route>
        </Route>

        {/* Catch-all route redirects to home page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
