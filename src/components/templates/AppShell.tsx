import { Outlet, NavLink } from 'react-router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCartShopping, faClipboardList, faGear } from '@fortawesome/free-solid-svg-icons';

const NAV_ITEMS = [
  { to: '/', end: true, icon: faCartShopping, label: 'Shop' },
  { to: '/default-list', end: false, icon: faClipboardList, label: 'Default List' },
  { to: '/settings', end: false, icon: faGear, label: 'Settings' },
] as const;

export default function AppShell() {
  return (
    <div className="flex flex-col h-dvh">
      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
      <nav className="bg-primary h-16 shrink-0 flex items-center justify-around px-2">
        {NAV_ITEMS.map(({ to, end, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors',
                isActive ? 'text-accent bg-accent/10' : 'text-primary-foreground',
              ].join(' ')
            }
          >
            <FontAwesomeIcon icon={icon} className="text-lg" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
