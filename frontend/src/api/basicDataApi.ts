/**
 * API contract (backend not built yet):
 *
 *   GET  /api/basic-data
 *   POST /api/basic-data/upload   (multipart/form-data, .csv/.sql)
 *   GET  /api/basic-data/export   (CSV)
 */
import { apiRequest, apiUpload, mockDelay, USE_MOCK_DATA } from './client';
import type { ApiResponse, BasicDataRecord, PaginatedResponse, UploadResult } from '../types';
import { generateMockBasicData } from '../mocks/mockData';
import { applyTableQuery, type TableQuery } from './queryUtils';

const MOCK_BASIC_DATA = generateMockBasicData(212);

export async function fetchBasicData(
  query: TableQuery
): Promise<ApiResponse<PaginatedResponse<BasicDataRecord>>> {
  if (USE_MOCK_DATA) {
    const result = applyTableQuery(MOCK_BASIC_DATA, query, ['projectName', 'reraId', 'promoter']);
    return { success: true, data: await mockDelay(result, 400) };
  }
  return apiRequest<PaginatedResponse<BasicDataRecord>>('/api/basic-data', {
    params: query as unknown as Record<string, string | number | boolean | null | undefined>,
  });
}

export async function uploadBasicData(
  file: File,
  onProgress?: (percent: number) => void
): Promise<ApiResponse<UploadResult>> {
  if (USE_MOCK_DATA) {
    for (const pct of [20, 50, 75, 100]) {
      await mockDelay(null, 150);
      onProgress?.(pct);
    }
    const total = 3100;
    const inserted = Math.floor(Math.random() * 250) + 30;
    return {
      success: true,
      data: { success: true, totalRecords: total, inserted, duplicates: total - inserted, failed: 0 },
    };
  }
  return apiUpload<UploadResult>('/api/basic-data/upload', file, onProgress).then((res) =>
    res.success && res.data ? { success: true, data: res.data } : (res as ApiResponse<UploadResult>)
  );
}

export async function exportBasicData(): Promise<ApiResponse<{ url: string }>> {
  if (USE_MOCK_DATA) {
    return { success: true, data: await mockDelay({ url: 'mock://basic-data-export.csv' }, 300) };
  }
  return apiRequest<{ url: string }>('/api/basic-data/export');
}

export function getAllMockBasicDataForExport(): BasicDataRecord[] {
  return MOCK_BASIC_DATA;
}
