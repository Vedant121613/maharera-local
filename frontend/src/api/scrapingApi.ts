/**
 * API contract (backend not built yet):
 *
 *   GET  /api/dashboard/stats
 *   GET  /api/scraping/districts
 *   POST /api/scraping/{district}/{worker}/start
 *   POST /api/scraping/{district}/{worker}/stop
 *
 * NOTE ON START/STOP:
 * The scraper runs on a LOCAL machine, while frontend+backend run on the
 * server. A POST here cannot itself launch a local Python process — it can
 * only ask the backend to record an intent / relay it to a future
 * local-agent bridge (queue, WebSocket, polling agent, etc). Until that
 * bridge exists, start/stop below are mocked and only mutate in-memory
 * mock state so the UI is fully wired for the real integration later.
 */
import { apiRequest, mockDelay, USE_MOCK_DATA } from './client';
import type { ApiResponse, DashboardStats, DistrictScrapingState, WorkerAction, WorkerKind } from '../types';
import { MOCK_DISTRICT_STATES, getMockDashboardStats } from '../mocks/mockData';

// In-memory mutable copy so Start/Stop actions visibly affect the mock UI.
let districtStateCache: DistrictScrapingState[] = MOCK_DISTRICT_STATES.map((d) => ({ ...d }));

export async function fetchDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  if (USE_MOCK_DATA) {
    return { success: true, data: await mockDelay(getMockDashboardStats()) };
  }
  return apiRequest<DashboardStats>('/api/dashboard/stats');
}

export async function fetchDistrictStates(): Promise<ApiResponse<DistrictScrapingState[]>> {
  if (USE_MOCK_DATA) {
    return { success: true, data: await mockDelay(districtStateCache, 400) };
  }
  return apiRequest<DistrictScrapingState[]>('/api/scraping/districts');
}

function nextStatus(action: WorkerAction) {
  switch (action) {
    case 'start':
    case 'resume':
    case 'restart':
      return 'running' as const;
    case 'stop':
      return 'stopped' as const;
  }
}

export async function setWorkerAction(
  districtId: number,
  worker: WorkerKind,
  action: WorkerAction
): Promise<ApiResponse<DistrictScrapingState>> {
  if (USE_MOCK_DATA) {
    districtStateCache = districtStateCache.map((d) => {
      if (d.districtId !== districtId) return d;
      const updated: DistrictScrapingState = { ...d, lastUpdated: new Date().toISOString() };
      if (worker === 'link') updated.linkStatus = nextStatus(action);
      else updated.dataStatus = nextStatus(action);
      return updated;
    });
    const updated = districtStateCache.find((d) => d.districtId === districtId)!;
    return { success: true, data: await mockDelay(updated, 350) };
  }
  return apiRequest<DistrictScrapingState>(`/api/scraping/${districtId}/${worker}/${action}`, {
    method: 'POST',
  });
}
