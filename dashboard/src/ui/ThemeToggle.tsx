import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [dark]);

  return (
    <button
      onClick={() => setDark(d => !d)}
      className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-700"
      title="Toggle theme"
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
