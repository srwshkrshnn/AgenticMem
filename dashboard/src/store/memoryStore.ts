import { create } from 'zustand';
import { Memory } from '../types';
import { addMemory, searchMemories, updateMemory, deleteMemory } from '../api/client';

interface MemoryState {
  memories: Memory[];
  query: string;
  loading: boolean;
  search: (q: string) => void;
  fetchMemories: (q: string) => Promise<void>;
  addMemory: (content: string) => Promise<void>;
  removeMemory: (id: string) => void;
  updateMemoryContent: (id: string, content: string) => void;
}

const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  query: '',
  loading: false,
  search: (q) => set({ query: q }),
  fetchMemories: async (q: string) => {
    set({ loading: true });
    try {
      const data = await searchMemories(q);
      set({ memories: data });
    } finally {
      set({ loading: false });
    }
  },
  addMemory: async (content: string) => {
    const mem = await addMemory(content);
    set({ memories: [mem, ...get().memories] });
  },
  removeMemory: (id: string) => {
    // optimistic removal (backend delete missing)
    deleteMemory(id);
    set({ memories: get().memories.filter(m => m.id !== id) });
  },
  updateMemoryContent: (id: string, content: string) => {
    updateMemory(id, content);
    set({ memories: get().memories.map(m => m.id === id ? { ...m, content } : m) });
  }
}));

export default useMemoryStore;
