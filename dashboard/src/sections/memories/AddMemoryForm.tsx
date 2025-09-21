import { useState } from 'react';
import useMemoryStore from '../../store/memoryStore';
import { PlusIcon } from '@heroicons/react/24/outline';

export default function AddMemoryForm() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const add = useMemoryStore(s => s.addMemory);

  const submit = async () => {
    if (!content.trim()) return;
    await add(content.trim());
    setContent('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white shadow-glass hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        <PlusIcon className="w-5 h-5" /> Add Memory
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-glass">
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Write a memory..."
        className="w-full text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="mt-3 flex items-center gap-3 justify-end">
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >Cancel</button>
        <button
          onClick={submit}
          className="px-4 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50"
          disabled={!content.trim()}
        >Save</button>
      </div>
    </div>
  );
}
