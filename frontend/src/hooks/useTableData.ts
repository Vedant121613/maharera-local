import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import type { ApiResponse, AsyncStatus, PaginatedResponse, SortDirection } from '../types';
import type { TableQuery } from '../api/queryUtils';

interface UseTableDataOptions<T> {
  fetcher: (query: TableQuery) => Promise<ApiResponse<PaginatedResponse<T>>>;
  pageSize?: number;
}

export function useTableData<T>({ fetcher, pageSize = 10 }: UseTableDataOptions<T>) {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [district, setDistrict] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  const [status, setStatus] = useState<AsyncStatus>('loading');
  const [rows, setRows] = useState<T[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const query: TableQuery = useMemo(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      district,
      status: statusFilter,
      sortColumn,
      sortDirection,
    }),
    [page, pageSize, debouncedSearch, district, statusFilter, sortColumn, sortDirection]
  );

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetcher(query).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.data) {
        setStatus('error');
        return;
      }
      setRows(res.data.data);
      setTotalItems(res.data.pagination.totalItems);
      setTotalPages(res.data.pagination.totalPages);
      setStatus(res.data.data.length === 0 ? 'empty' : 'success');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, reloadKey]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, district, statusFilter]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  return {
    rows,
    status,
    totalItems,
    totalPages,
    page,
    setPage,
    search,
    setSearch,
    district,
    setDistrict,
    statusFilter,
    setStatusFilter,
    sortColumn,
    sortDirection,
    handleSort,
    refetch: () => setReloadKey((k) => k + 1),
  };
}
