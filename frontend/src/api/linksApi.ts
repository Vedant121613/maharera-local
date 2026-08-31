/**
 * API contract (backend not built yet):
 *
 *   GET  /api/links                 (query: page, pageSize, search, district, status, sortColumn, sortDirection)
 *   POST /api/links/upload          (multipart/form-data, .sql file)
 *   GET  /api/links/export          (returns generated Excel file)
 *
 * The frontend NEVER parses or executes the uploaded SQL file itself —
 * it only forwards the raw file to the backend via multipart/form-data.
 * Excel generation also happens server-side; the frontend only triggers
 * the download.
 */
import { apiRequest, apiUpload, mockDelay, USE_MOCK_DATA } from './client';
import type { ApiResponse, LinkRecord, PaginatedResponse, UploadResult } from '../types';
import { generateMockLinks } from '../mocks/mockData';
import { applyTableQuery, type TableQuery } from './queryUtils';

const MOCK_LINKS = generateMockLinks(248);

export async function fetchLinks(query: TableQuery): Promise<ApiResponse<PaginatedResponse<LinkRecord>>> {
  if (USE_MOCK_DATA) {
    const result = applyTableQuery(MOCK_LINKS, query, ['projectName', 'reraId', 'village', 'taluka']);
    return { success: true, data: await mockDelay(result, 400) };
  }
  return apiRequest<PaginatedResponse<LinkRecord>>('/api/links', { params: query as unknown as Record<string, string | number | boolean | null | undefined> });
}

export async function uploadLinksSql(
  file: File,
  onProgress?: (percent: number) => void
): Promise<ApiResponse<UploadResult>> {
  if (USE_MOCK_DATA) {
    // Simulate an upload progress ramp so the UI's progress bar is exercised.
    for (const pct of [15, 40, 65, 90, 100]) {
      await mockDelay(null, 150);
      onProgress?.(pct);
    }
    const total = 5200;
    const inserted = Math.floor(Math.random() * 400) + 50;
    return {
      success: true,
      data: {
        success: true,
        district: 'Pune',
        totalRecords: total,
        inserted,
        duplicates: total - inserted,
        failed: 0,
      },
    };
  }
  return apiUpload<UploadResult>('/api/links/upload', file, onProgress).then((res) =>
    res.success && res.data ? { success: true, data: res.data } : (res as ApiResponse<UploadResult>)
  );
}

export async function exportLinks(): Promise<ApiResponse<{ url: string }>> {
  if (USE_MOCK_DATA) {
    return { success: true, data: await mockDelay({ url: 'mock://links-export.xlsx' }, 300) };
  }
  return apiRequest<{ url: string }>('/api/links/export');
}

export function getAllMockLinksForExport(): LinkRecord[] {
  return MOCK_LINKS;
}
