import type { PaginatedResponse, SortDirection } from '../types';

export interface TableQuery {
  page: number;
  pageSize: number;
  search?: string;
  district?: string | null;
  status?: string | null;
  sortColumn?: string | null;
  sortDirection?: SortDirection;
}

/**
 * Applies search / district / status filtering, sorting, and pagination
 * to an in-memory array — stands in for what the backend's SQL query
 * (WHERE / ORDER BY / LIMIT-OFFSET) will do once it exists.
 */
export function applyTableQuery<T extends object>(
  rows: T[],
  query: TableQuery,
  searchableFields: (keyof T)[]
): PaginatedResponse<T> {
  let result = [...rows];
  const asRecord = (row: T) => row as unknown as Record<string, unknown>;

  if (query.search) {
    const term = query.search.toLowerCase();
    result = result.filter((row) =>
      searchableFields.some((field) => String(asRecord(row)[field as string] ?? '').toLowerCase().includes(term))
    );
  }

  if (query.district) {
    result = result.filter((row) => asRecord(row).district === query.district);
  }

  if (query.status) {
    result = result.filter(
      (row) => asRecord(row).status === query.status || asRecord(row).projectStatus === query.status
    );
  }

  if (query.sortColumn) {
    const col = query.sortColumn;
    const dir = query.sortDirection === 'desc' ? -1 : 1;
    result.sort((a, b) => {
      const av = asRecord(a)[col];
      const bv = asRecord(b)[col];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
  }

  const totalItems = result.length;
  const totalPages = Math.max(Math.ceil(totalItems / query.pageSize), 1);
  const start = (query.page - 1) * query.pageSize;
  const pageData = result.slice(start, start + query.pageSize);

  return {
    data: pageData,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    },
  };
}
