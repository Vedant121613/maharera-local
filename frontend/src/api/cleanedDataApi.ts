/**
 * API contract (backend not built yet):
 *
 *   GET  /api/cleaned-data   -> { columns: [...], rows: [...], pagination: {...} }
 *   POST /api/cleaned-data/upload
 *   GET  /api/cleaned-data/export   (CSV)
 *
 * Cleaned Data columns are NOT hardcoded on the frontend: the backend
 * response shape is `{ columns, rows }` and the table renders whatever
 * columns it receives (see DynamicColumn / DynamicTableResponse types).
 */
import { apiRequest, apiUpload, mockDelay, USE_MOCK_DATA } from './client';
import type { ApiResponse, DynamicTableResponse, UploadResult } from '../types';
import { generateMockCleanedData } from '../mocks/mockData';
import { applyTableQuery, type TableQuery } from './queryUtils';

const MOCK_CLEANED = generateMockCleanedData(180);

export async function fetchCleanedData(query: TableQuery): Promise<ApiResponse<DynamicTableResponse>> {
  if (USE_MOCK_DATA) {
    const { data, pagination } = applyTableQuery(
      MOCK_CLEANED.rows as unknown as Record<string, unknown>[],
      query,
      ['projectName', 'reraId', 'promoter']
    );
    return {
      success: true,
      data: await mockDelay(
        { columns: MOCK_CLEANED.columns, rows: data as DynamicTableResponse['rows'], pagination },
        400
      ),
    };
  }
  return apiRequest<DynamicTableResponse>('/api/cleaned-data', { params: query as unknown as Record<string, string | number | boolean | null | undefined> });
}

export async function uploadCleanedData(
  file: File,
  onProgress?: (percent: number) => void
): Promise<ApiResponse<UploadResult>> {
  if (USE_MOCK_DATA) {
    for (const pct of [25, 55, 80, 100]) {
      await mockDelay(null, 150);
      onProgress?.(pct);
    }
    const total = 1800;
    const inserted = Math.floor(Math.random() * 150) + 20;
    return {
      success: true,
      data: { success: true, totalRecords: total, inserted, duplicates: total - inserted, failed: 0 },
    };
  }
  return apiUpload<UploadResult>('/api/cleaned-data/upload', file, onProgress).then((res) =>
    res.success && res.data ? { success: true, data: res.data } : (res as ApiResponse<UploadResult>)
  );
}

export async function exportCleanedData(): Promise<ApiResponse<{ url: string }>> {
  if (USE_MOCK_DATA) {
    return { success: true, data: await mockDelay({ url: 'mock://cleaned-data-export.csv' }, 300) };
  }
  return apiRequest<{ url: string }>('/api/cleaned-data/export');
}
