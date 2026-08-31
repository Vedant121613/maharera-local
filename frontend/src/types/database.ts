export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp?: string;
  error?: string;
}

export interface DatabaseInfo {
  status: 'connected' | 'disconnected';
  database: string;
  version: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalRows: number;
  totalPages: number;
}

export interface TableDetails {
  tableName: string;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  pagination: PaginationMeta;
}