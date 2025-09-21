import { create } from 'zustand';

interface SourceState {
  backgroundSources: string[];
  browserSources: string[];
  toggleBackground: (key: string) => void;
  toggleBrowser: (key: string) => void;
}

function toggle(list: string[], key: string) {
  return list.includes(key) ? list.filter(x => x !== key) : [...list, key];
}

const PERSIST_KEY = 'agenticmem:sources';

const stored = (() => {
  try { return JSON.parse(localStorage.getItem(PERSIST_KEY) || 'null'); } catch { return null; }
})();

const useSourceStore = create<SourceState>((set, get) => ({
  backgroundSources: stored?.backgroundSources || [],
  browserSources: stored?.browserSources || [],
  toggleBackground: (key: string) => set(state => {
    const backgroundSources = toggle(state.backgroundSources, key);
    persist({ ...state, backgroundSources });
    return { backgroundSources };
  }),
  toggleBrowser: (key: string) => set(state => {
    const browserSources = toggle(state.browserSources, key);
    persist({ ...state, browserSources });
    return { browserSources };
  })
}));

function persist(state: any) {
  try { localStorage.setItem(PERSIST_KEY, JSON.stringify({ backgroundSources: state.backgroundSources, browserSources: state.browserSources })); } catch {}
}

export default useSourceStore;
