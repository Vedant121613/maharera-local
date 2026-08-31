/**
 * These record shapes are FRONTEND PLACEHOLDERS.
 *
 * They are deliberately kept close to what each worker/scraper is expected
 * to produce, but they are NOT the final SQL schema. When the Link Worker,
 * Data Worker, and Cleaner schemas are finalized, only these type files
 * (and the matching mock generators) need to change — components consume
 * them structurally and don't hardcode field lists beyond what's declared
 * here.
 */

export type RecordStatus = 'active' | 'pending' | 'inactive' | 'error';

/** Row produced by the Link Worker (Tab 2 — Links) */
export interface LinkRecord {
  srNo: number;
  district: string;
  taluka: string;
  village: string;
  reraId: string;
  projectName: string;
  projectUrl: string;
  status: RecordStatus;
  scrapedAt: string; // ISO timestamp
}

/** Row produced by the Data Worker (Tab 3 — Basic Data) */
export interface BasicDataRecord {
  reraId: string;
  projectName: string;
  district: string;
  taluka: string;
  village: string;
  promoter: string;
  registrationDate: string; // ISO date
  projectStatus: string;
}

/**
 * Cleaned Data (Tab 4) is fully dynamic: the backend returns its own
 * column list alongside the rows, so the frontend never hardcodes fields.
 */
export interface DynamicColumn {
  key: string;
  label: string;
}

export interface DynamicTableResponse {
  columns: DynamicColumn[];
  rows: Record<string, string | number | null>[];
  pagination?: import('./common').Pagination;
}
