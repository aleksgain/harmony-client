import { NavLink } from 'react-router-dom';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '⌂', key: '1' },
  { to: '/hubs', label: 'Hubs', icon: '◉', key: '2' },
  { to: '/devices', label: 'Devices', icon: '▤', key: '3' },
  { to: '/activities', label: 'Activities', icon: '▶', key: '4' },
  { to: '/settings', label: 'Settings', icon: '⚙', key: '5' },
] as const;

export function Sidebar({ modKey }: { modKey: string }): JSX.Element {
  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-950">
      <div className="px-4 py-4">
        <div className="text-base font-semibold tracking-tight">Harmony Revival</div>
        <div className="muted text-xs">Hub configurator</div>
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-accent/10 font-medium text-accent'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800'
                }`
              }
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="w-4 text-center">
                  {item.icon}
                </span>
                {item.label}
              </span>
              <kbd className="muted text-[10px]">
                {modKey}
                {item.key}
              </kbd>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
