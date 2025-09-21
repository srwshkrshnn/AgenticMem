import axios from 'axios';
import { Memory } from '../types';

const api = axios.create({
  baseURL: '/api/memories'
});

export async function searchMemories(query: string): Promise<Memory[]> {
  const resp = await api.get('/retrieve/', { params: { q: query, top_k: 25 } });
  return resp.data as Memory[];
}

export async function addMemory(content: string): Promise<Memory> {
  const resp = await api.post('/add/', { content });
  return resp.data as Memory;
}

// Backend doesn't expose update/delete yet; placeholder for when endpoints added
export async function updateMemory(id: string, content: string): Promise<void> {
  console.warn('Update not implemented on backend yet', id, content);
}

export async function deleteMemory(id: string): Promise<void> {
  console.warn('Delete not implemented on backend yet', id);
}
