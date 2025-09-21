// Backend integration helpers for Django memories service
// Assumptions:
// - Backend is served at same origin with prefix /api/memories/
//   Endpoints implemented in Django:
//   POST /api/memories/add/            -> { content }
//   GET  /api/memories/list/?limit=N   -> list recent
//   GET  /api/memories/retrieve/?q=... -> semantic search (returns list)
//   GET/PUT/PATCH/DELETE /api/memories/<id>/
// - We only have 'content' plus timestamps; embedding never sent to UI.
// - retrieve returns objects possibly with a 'similarity' field we surface optionally.

export interface BackendMemory {
  id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  similarity?: number; // only on retrieve endpoint
}

export type CreateMemoryRequest = { content: string };
export type UpdateMemoryRequest = { content: string };

// Allow override via Vite env var VITE_API_BASE (e.g., http://localhost:8000)
// Fallback to relative which will hit proxy in dev.
const API_BASE = (import.meta as any).env?.VITE_API_BASE?.replace(/\/$/, '') || '';
const BASE = `${API_BASE}/api/memories`;

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg: any;
    try { msg = await res.json(); } catch { msg = await res.text(); }
    throw new Error(typeof msg === 'string' ? msg : msg.error || JSON.stringify(msg));
  }
  // Try JSON; if HTML returned (often due to proxy/misconfig) provide better diagnostics
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    throw new Error('Received HTML instead of JSON from API (possible wrong base URL or dev proxy misconfiguration)');
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error('Failed to parse JSON from API: ' + (e as Error).message);
  }
}

export async function listMemories(limit = 50): Promise<BackendMemory[]> {
  const res = await fetch(`${BASE}/list/?limit=${limit}`, { credentials: 'include' });
  return handle<BackendMemory[]>(res);
}

export async function searchMemories(query: string, topK?: number): Promise<BackendMemory[]> {
  const params = new URLSearchParams({ q: query });
  if (topK) params.append('top_k', String(topK));
  const res = await fetch(`${BASE}/retrieve/?${params.toString()}`, { credentials: 'include' });
  return handle<BackendMemory[]>(res);
}

export async function createMemory(data: CreateMemoryRequest): Promise<BackendMemory> {
  const res = await fetch(`${BASE}/add/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include'
  });
  return handle<BackendMemory>(res);
}

export async function updateMemory(id: string, data: UpdateMemoryRequest): Promise<BackendMemory> {
  const res = await fetch(`${BASE}/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include'
  });
  return handle<BackendMemory>(res);
}

export async function deleteMemory(id: string): Promise<{ status: string; id: string } | { error: string }> {
  const res = await fetch(`${BASE}/${id}/`, { method: 'DELETE', credentials: 'include' });
  return handle(res);
}
