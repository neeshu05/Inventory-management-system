import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="animate-spin w-9 h-9 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return user ? <Outlet /> : <Navigate to="/login" replace />
}
