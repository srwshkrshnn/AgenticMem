import { Memory } from '../../types';
import { EllipsisHorizontalIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import useMemoryStore from '../../store/memoryStore';
import { useState } from 'react';

interface Props { memory: Memory }

export default function MemoryRow({ memory }: Props) {
  const remove = useMemoryStore(s => s.removeMemory);
  const update = useMemoryStore(s => s.updateMemoryContent);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(memory.content);

  return (
    <li className="group p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition flex items-start gap-4">
      <div className="flex-1">
        {editing ? (
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full text-sm bg-white dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            rows={3}
          />
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{memory.content}</p>
        )}
        <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition text-xs">
          {editing ? (
            <>
              <button
                onClick={() => { update(memory.id, value); setEditing(false); }}
                className="px-2 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-500"
              >Save</button>
              <button
                onClick={() => { setValue(memory.content); setEditing(false); }}
                className="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
              >Cancel</button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
              ><PencilIcon className="w-4 h-4" /> Edit</button>
              <button
                onClick={() => remove(memory.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-600 text-white hover:bg-rose-500"
              ><TrashIcon className="w-4 h-4" /> Delete</button>
            </>
          )}
        </div>
      </div>
      <div className="text-[10px] text-slate-400 pt-1 min-w-[60px] text-right">
        {(memory.similarity !== undefined) && (
          <span className="font-mono">{(memory.similarity * 100).toFixed(1)}%</span>
        )}
      </div>
      <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><EllipsisHorizontalIcon className="w-5 h-5" /></button>
    </li>
  );
}
