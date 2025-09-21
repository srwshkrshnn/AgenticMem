import useMemoryStore from '../../store/memoryStore';
import { useEffect } from 'react';
import MemoryRow from './MemoryRow';

export default function MemoryList() {
  const { memories, query, fetchMemories, loading } = useMemoryStore();

  useEffect(() => {
    const trimmed = query.trim();
    // Debounced search when user enters text
    if (trimmed) {
      const id = setTimeout(() => fetchMemories(trimmed), 300);
      return () => clearTimeout(id);
    }
    // When no query, load recent memories (list endpoint via store logic)
    fetchMemories('');
  }, [query, fetchMemories]);

  return (
    <div className="space-y-2">
      {loading && <div className="text-sm text-slate-500">Searching...</div>}
      {!loading && memories.length === 0 && (
        <div className="text-sm text-slate-500">No memories found. Try a different search.</div>
      )}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white/60 dark:bg-slate-900/40 backdrop-blur-xs">
        {memories.map(m => (
          <MemoryRow key={m.id} memory={m} />
        ))}
      </ul>
    </div>
  );
}
