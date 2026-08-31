# RERA Data Dashboard — Frontend

A production-style admin dashboard for the MahaRERA scraping pipeline
(`rera-new-data-shravni`). This package covers **`frontend/` only** —
see the architecture notes below for how it fits with `backend/`,
`link_worker/`, `data_worker/`, and `cleaner/`.

## Tech stack

React 19 · Vite · TypeScript · React Router · Mantine UI 7 · `@tabler/icons-react` · `xlsx` (client-side export while mock mode is on)

## Architecture

```
LOCAL PC                                   SERVER
├── link_worker                            ├── Frontend  (this repo)
├── data_worker         → SQL files  →      ├── Backend API
└── cleaner                                 └── PostgreSQL
```

The frontend **never** talks to PostgreSQL and never holds DB
credentials. All data access goes through a typed API service layer in
`src/api/`, which currently returns **mock data** because the backend
doesn't exist yet.

```
Frontend  →  Backend API  →  PostgreSQL
```

### Frontend vs. Backend vs. Local Worker

| Feature | Frontend | Backend | Local Worker |
|---|---|---|---|
| District selection | Yes | Later | Yes |
| Start/Stop scraping | UI only (mock action) | Needed | Needed |
| Show progress | UI only (mock data) | Needed | Needed |
| SQL upload | UI only (upload widget) | Needed (validate + insert) | No |
| Save to PostgreSQL | Never | Needed | No |
| Download Excel/CSV | UI only (button wired to endpoint) | Needed (file generation) | No |
| Display DB data | UI only (mock rows) | Needed | No |
| Real-time status | UI structured for polling/WebSocket | Needed | Needed |

**Important:** the local scraper runs on your PC; frontend + backend
run on the server. A Start/Stop click here cannot itself launch a
local Python process — it can only ask the backend to record an
intent. A future local-agent/bridge is required to actually control
the local workers. Until then, Start/Stop mutate mock in-memory state
only.

## Project structure

```
src/
├── api/            Service layer — one file per resource, all mock-data-backed for now
│   ├── client.ts        fetch/upload wrapper, VITE_API_BASE_URL, USE_MOCK_DATA flag
│   ├── queryUtils.ts     shared search/filter/sort/paginate helper for mock data
│   ├── scrapingApi.ts
│   ├── linksApi.ts
│   ├── basicDataApi.ts
│   └── cleanedDataApi.ts
├── components/
│   ├── layout/       AppLayout, Sidebar, Header
│   ├── scraping/     DistrictControl, DistrictScrapingTable
│   └── common/        StatusBadge, ProgressBar, DataTable, FileUpload,
│                       ExportButton, StatCard, ConfirmDialog, AsyncStates
├── pages/            ScrapingPage, LinksPage, BasicDataPage, CleanedDataPage
├── hooks/            useTableData (search/filter/sort/pagination state + fetch)
├── types/            District, WorkerStatus, LinkRecord, BasicDataRecord,
│                       DynamicTableResponse, DashboardStats, UploadResult, etc.
├── mocks/            districts.ts (real MahaRERA district id/name list) + mockData.ts
├── utils/            exportUtils.ts (CSV/Excel), fileValidation.ts
└── theme.ts          Mantine theme (palette, type, status colors)
```

## Switching from mock data to a real backend

1. Set `VITE_API_BASE_URL` in `.env` (see `.env.example`).
2. That's it for wiring — every function in `src/api/*.ts` already
   checks `USE_MOCK_DATA` (true only when `VITE_API_BASE_URL` is
   empty) and falls through to `apiRequest`/`apiUpload` against the
   real backend otherwise. No component changes are required.
3. Replace the mock-only helpers (`getAllMockLinksForExport`,
   `getAllMockBasicDataForExport`) once `GET /api/*/export` returns a
   real file — swap the client-side `xlsx` generation for a direct
   download of the backend's response.

### API contract (placeholders — backend not built yet)

```
GET  /api/dashboard/stats
GET  /api/scraping/districts
POST /api/scraping/{districtId}/{link|data}/{start|stop|resume|restart}

GET  /api/links
POST /api/links/upload
GET  /api/links/export

GET  /api/basic-data
POST /api/basic-data/upload
GET  /api/basic-data/export

GET  /api/cleaned-data          -> { columns: [...], rows: [...], pagination }
POST /api/cleaned-data/upload
GET  /api/cleaned-data/export
```

Cleaned Data columns are **not hardcoded** — the table renders
whatever `columns` the backend returns, so the Cleaner's schema can
change without a frontend deploy.

## Local development

```bash
npm install
cp .env.example .env    # leave VITE_API_BASE_URL empty to use mock data
npm run dev
```

## Production build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## Docker (for Coolify)

Multi-stage build: `node` (npm ci + vite build) then `nginx` (serves
`dist/`, with SPA fallback routing so React Router's client-side
routes work on refresh).

```bash
docker build --build-arg VITE_API_BASE_URL=https://api.yourdomain.com -t rera-frontend .
docker run -p 8080:80 rera-frontend
```

**Note:** `VITE_*` variables are inlined into the JS bundle at build
time, not read at container runtime — pass `VITE_API_BASE_URL` as a
Docker build-arg (as above) or set it in Coolify's build-time
environment, not its runtime environment.

## Environment variables

Only one variable is used, and it must never contain secrets:

```env
VITE_API_BASE_URL=
```

`VITE_*` variables are exposed to the browser. Never put database
credentials, passwords, or secret keys in frontend env vars — those
belong only in the backend.
