import { NavLink } from 'react-router-dom'
import Icon from './Icon'

const NAV = [
  { to: '/',          label: 'Dashboard', icon: 'dashboard',     exact: true },
  { to: '/products',  label: 'Products',  icon: 'inventory_2'               },
  { to: '/customers', label: 'Customers', icon: 'group'                      },
  { to: '/orders',    label: 'Orders',    icon: 'shopping_cart'              },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-on-secondary-fixed border-t border-white/10 flex md:hidden z-50">
      {NAV.map(({ to, label, icon, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              isActive ? 'text-primary-fixed' : 'text-secondary-fixed-dim opacity-60'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={icon} fill={isActive} size={22} />
              <span className="text-[10px] font-medium">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
