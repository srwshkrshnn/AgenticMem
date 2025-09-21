# Dashboard

React (Vite) dashboard integrated with Django memories backend.

## Backend Integration

The dashboard now talks directly to the Django service endpoints (treated as ground truth):

Endpoint | Method | Used For
---------|--------|---------
/api/memories/list/?limit=N | GET | Recent memories (sidebar count + default view)
/api/memories/retrieve/?q=TEXT&top_k=K | GET | Semantic search (when search box has text)
/api/memories/add/ | POST | Create memory { content }
/api/memories/<id>/ | PATCH | Update memory { content }
/api/memories/<id>/ | DELETE | Delete memory

Implementation details:
- All calls implemented in `client/src/lib/memoriesApi.ts` (single place for shapes & fetch wrappers).
- UI components no longer use the Drizzle `Memory` schema (title/source/tags removed). Only `content` + timestamps.
- `MemoryCard` derives a short title from the first sentence of content.
- Optional `similarity` (0-1) from retrieve endpoint is shown when present.
- React Query manages caching & invalidation (`['memories', ...]` query keys).
- Search mode activates when search input non-empty; clearing input returns to recent list mode.
- Dev Access: either rely on the Express dev proxy (mounts `/api` -> `http://localhost:8000`) or set `VITE_API_BASE` to point directly at the Django origin (preferred for clarity). The proxy only attaches when `NODE_ENV=development`.

## Editing / Adding Memories
- Add/Edit form (`MemoryForm`) now only has a textarea for content.
- After create/update/delete we invalidate all `memories` queries so list & sidebar counters refresh.

## Styling & Layout
No major structural changes—only data plumbing & simplified forms/cards.

## Future Enhancements (Not Implemented)
- Debounced search requests.
- Pagination or infinite scrolling for large memory sets.
- Dedicated count endpoint (currently list used for count which scales linearly).
- Toast notifications for mutation success/failure.
- Auth integration (currently anonymous / AllowAny on backend).

## Assumptions
1. Dashboard and Django API share same origin or proxy so relative `/api/...` paths work.
2. CORS & CSRF handled server-side (backend endpoints use AllowAny and some are csrf_exempt already).
3. Timestamps returned as ISO strings parseable by `new Date()`.
4. If you see `Received HTML instead of JSON from API` in the UI, the request likely hit the frontend dev server instead of Django. Add `client/.env.local` with `VITE_API_BASE=http://localhost:8000` and restart.

## Local Development
Install dependencies and run dev server:

```bash
npm install
npm run dev
```

Ensure Django backend is running on the same base URL (e.g., http://localhost:8000) OR configure a dev proxy in `vite.config.ts` if hosted elsewhere.

### Using explicit API base
Create `client/.env.local`:

```
VITE_API_BASE=http://localhost:8000
```

Restart `npm run dev` so the client fetches directly from Django instead of relying on proxy.

## File Reference
- `client/src/lib/memoriesApi.ts` – backend fetch helpers
- `client/src/pages/dashboard.tsx` – main integration logic
- `client/src/components/memory-form.tsx` – create/update form (content only)
- `client/src/components/memory-card.tsx` – display card (derived title)
- `client/src/App.tsx` – sidebar memory count query

