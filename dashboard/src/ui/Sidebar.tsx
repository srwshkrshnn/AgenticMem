import { NavLink } from 'react-router-dom';
import { Brain, Database, Settings } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Memories', icon: Brain },
  { to: '/sources', label: 'Sources', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export default function Sidebar() {
  return (
    <aside className="w-60 hidden md:flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xs">
      <div className="h-14 flex items-center px-6 font-bold tracking-tight text-brand-700 dark:text-brand-300">AM</div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-brand-600 text-white shadow-glass' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/70 dark:hover:bg-slate-800/40'}`}
            >
              <Icon className="w-4 h-4" /> {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-4 text-xs text-slate-400">v0.1.0</div>
    </aside>
  );
}
