import { NavLink, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'

const NAV = [
  { to: '/',          label: 'Dashboard', icon: 'dashboard',     exact: true },
  { to: '/products',  label: 'Products',  icon: 'inventory_2'               },
  { to: '/customers', label: 'Customers', icon: 'group'                      },
  { to: '/orders',    label: 'Orders',    icon: 'shopping_cart'              },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    toast.success('Signed out')
    navigate('/login')
  }

  return (
    <aside className="fixed left-0 top-0 w-sidebar-width h-screen bg-on-secondary-fixed flex flex-col py-6 border-r border-outline-variant/20 z-50">
      {/* Brand */}
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shrink-0">
          <Icon name="inventory_2" fill size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-on-primary leading-tight">InvenTrack</h1>
          <p className="text-[11px] text-secondary-fixed-dim opacity-70 leading-tight">Management System</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map(({ to, label, icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-sm font-medium ${
                isActive
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-secondary-fixed-dim hover:text-on-primary-container hover:bg-white/10'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={icon} fill={isActive} size={22} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 pt-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.username}</p>
            <p className="text-[11px] text-secondary-fixed-dim opacity-70 truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
