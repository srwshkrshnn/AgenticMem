import { create } from 'zustand';
import { Memory } from '../types';
import { addMemory, searchMemories, updateMemory, deleteMemory, listMemories } from '../api/client';

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
      const trimmed = q.trim();
      let data: Memory[];
      if (!trimmed) {
        data = await listMemories(50);
      } else {
        data = await searchMemories(trimmed);
      }
      set({ memories: data });
    } finally {
      set({ loading: false });
    }
  },
  addMemory: async (content: string) => {
    const mem = await addMemory(content);
    set({ memories: [mem, ...get().memories] });
  },
  removeMemory: async (id: string) => {
    const prev = get().memories;
    set({ memories: prev.filter(m => m.id !== id) });
    try {
      await deleteMemory(id);
    } catch (e) {
      console.error('Failed to delete memory, rolling back', e);
      set({ memories: prev });
    }
  },
  updateMemoryContent: async (id: string, content: string) => {
    const prev = get().memories;
    const updated = prev.map(m => m.id === id ? { ...m, content } : m);
    set({ memories: updated });
    try {
      await updateMemory(id, content);
    } catch (e) {
      console.error('Failed to update memory, rolling back', e);
      set({ memories: prev });
    }
  }
}));

export default useMemoryStore;
