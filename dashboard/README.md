# AgenticMem Dashboard

A modern React + Vite + Tailwind dashboard for managing user memories and selecting ingestion sources.

## Features (MVP)
- Search memories (vector + relevance filtered backend endpoint `/memories/retrieve/` proxied via `/api/memories/retrieve/`)
- Add new memory (POST `/memories/add/`)
- Inline optimistic edit & delete (UI only; backend endpoints TBD)
- Select background API sources (Microsoft Graph & Google Workspace apps)
- Select browser capture sources (sites without stable public APIs, e.g. ChatGPT, Notion, etc.)
- Dark / light theme toggle

## Source Lists
### Microsoft Graph (sample set)
- Outlook Email
- Outlook Calendar
- Teams Chat
- OneNote
- OneDrive Files
- SharePoint
- Tasks / Planner

### Google Workspace
- Gmail
- Google Calendar
- Google Drive
- Google Docs
- Google Meet
- Google Chat
- Google Keep

### Browser / Extension (no formal API)
- ChatGPT
- Notion
- Confluence
- Jira
- Linear
- Slack Web
- Reddit
- YouTube
- Twitter / X
- Hacker News

## Development
Install deps:
```
cd dashboard
npm install
npm run dev
```
Dashboard runs on `http://localhost:5173` and proxies API calls to `http://localhost:8000/memories/*` using Vite dev server proxy.

## Future Enhancements
- Real update & delete memory endpoints
- Pagination / infinite scroll
- Authentication & per-user memory isolation client side
- Bulk operations, tagging, and advanced filters
- Graphiti episode visibility

## Notes
Only files inside the `dashboard/` folder were added per instruction.
