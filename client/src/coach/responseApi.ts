// client/src/coach/responseApi.ts
// API wrapper for fetching coach responses from database

export interface PoolQuery {
  event_type: string;
  pattern?: string;
  mode?: string;
  chatter_level?: string;
  locale?: string;
}

export interface PoolItem {
  id: number;
  textTemplate: string;
  priority: number;
  cooldownSec: number;
  lastUsedAt: string | null;
}

export async function fetchPool(q: PoolQuery): Promise<PoolItem[]> {
  const u = new URL('/api/coach-responses', window.location.origin);
  Object.entries({ ...q }).forEach(([k, v]) => v && u.searchParams.set(k, String(v)));
  const r = await fetch(u.toString(), { credentials: 'include' });
  if (!r.ok) throw new Error('fetchPool failed');
  const j = await r.json();
  return j.items as PoolItem[];
}

export async function markUsed(id: number) {
  await fetch(`/api/coach-responses/${id}/mark-used`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    credentials: 'include'
  });
}
