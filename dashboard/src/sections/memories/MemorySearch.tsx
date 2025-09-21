import { useState } from 'react';
import useMemoryStore from '../../store/memoryStore';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function MemorySearch() {
  const [query, setQuery] = useState('');
  const search = useMemoryStore(s => s.search);

  return (
    <div className="relative">
      <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={e => {
          const v = e.target.value;
          setQuery(v);
          search(v);
        }}
        placeholder="Search memories..."
        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-white/70 dark:bg-slate-800/60 backdrop-blur-xs focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-glass"
      />
    </div>
  );
}
