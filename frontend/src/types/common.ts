/**
 * Common / shared types used across the dashboard.
 */

export interface District {
  /** Numeric ID as used by MahaRERA's own district select (see project_district) */
  id: number;
  name: string;
}

/** Status of a single worker (link scraping or data scraping) for a district */
export type WorkerStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'failed';

/** Generic paginated API envelope */
export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

/** Standard API response wrapper used by every endpoint in the service layer */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

export interface UploadResult {
  success: boolean;
  district?: string;
  totalRecords: number;
  inserted: number;
  duplicates: number;
  failed: number;
  message?: string;
}

/** Async UI state used by every data-fetching view */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface UploadProgressState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number;
  fileName?: string;
  fileSize?: number;
  error?: string;
  result?: UploadResult;
}
