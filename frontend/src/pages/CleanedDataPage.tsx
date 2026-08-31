import { Alert, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { exportCleanedData, fetchCleanedData, uploadCleanedData } from '../api/cleanedDataApi';
import type { AsyncStatus, DynamicColumn, SortDirection, UploadResult } from '../types';
import { DataTable, type DataTableColumn } from '../components/common/DataTable';
import { ExportButton } from '../components/common/ExportButton';
import { FileUpload } from '../components/common/FileUpload';
import { DISTRICTS } from '../mocks/districts';
import { downloadAsCsv } from '../utils/exportUtils';

type Row = Record<string, string | number | null>;

export default function CleanedDataPage() {
  const [columns, setColumns] = useState<DynamicColumn[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<AsyncStatus>('loading');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [district, setDistrict] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, district]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchCleanedData({
      page,
      pageSize: 10,
      search: debouncedSearch || undefined,
      district,
      sortColumn,
      sortDirection,
    }).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.data) {
        setStatus('error');
        return;
      }
      setColumns(res.data.columns);
      setRows(res.data.rows);
      setTotalItems(res.data.pagination?.totalItems ?? res.data.rows.length);
      setTotalPages(res.data.pagination?.totalPages ?? 1);
      setStatus(res.data.rows.length === 0 ? 'empty' : 'success');
    });
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, district, sortColumn, sortDirection]);

  const handleSort = (col: string) => {
    if (sortColumn === col) setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const tableColumns: DataTableColumn<Row>[] = useMemo(
    () =>
      columns.map((c) => ({
        key: c.key,
        label: c.label,
        sortable: true,
        render: (r) => r[c.key] ?? '—',
      })),
    [columns]
  );

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} mb={4}>
            Cleaned Data
          </Title>
          <Text c="dimmed" size="sm">
            Final cleaned dataset produced by the Cleaner. Columns are rendered dynamically from
            whatever the backend returns — nothing here is hardcoded to a fixed schema.
          </Text>
        </div>
        <ExportButton
          label="Download CSV"
          tooltip="Export the currently available cleaned data as CSV"
          onExport={async () => {
            const res = await exportCleanedData();
            if (res.success) downloadAsCsv(rows as Record<string, unknown>[], 'cleaned-data-export.csv');
          }}
        />
      </Group>

      <Card padding="lg">
        <Text fw={600} mb={4}>
          Upload Data
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Upload the cleaned dataset export. The backend owns the schema — the frontend will render
          whatever columns come back.
        </Text>
        <FileUpload
          accept={['.csv', '.sql']}
          helperText="Supported: .csv, .sql"
          onUpload={async (file, onProgress) => {
            const res = await uploadCleanedData(file, onProgress);
            if (res.success && res.data) setLastUpload(res.data);
          }}
        />
        {lastUpload && (
          <Alert icon={<IconCircleCheck size={16} />} color="teal" variant="light" mt="md" radius="sm">
            <Group gap="xl">
              <Text size="sm">
                Records processed: <b>{lastUpload.totalRecords.toLocaleString('en-IN')}</b>
              </Text>
              <Text size="sm">
                New records: <b>{lastUpload.inserted.toLocaleString('en-IN')}</b>
              </Text>
              <Text size="sm">
                Duplicates skipped: <b>{lastUpload.duplicates.toLocaleString('en-IN')}</b>
              </Text>
              <Text size="sm">
                Failed: <b>{lastUpload.failed}</b>
              </Text>
            </Group>
          </Alert>
        )}
      </Card>

      <Card padding="lg">
        <DataTable
          columns={tableColumns}
          rows={rows}
          rowKey={(r) => String(r.reraId ?? JSON.stringify(r))}
          status={status}
          onRetry={() => setPage((p) => p)}
          search={search}
          onSearchChange={setSearch}
          districtFilter={district}
          onDistrictFilterChange={setDistrict}
          districtOptions={DISTRICTS.map((d) => d.name)}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={totalItems}
        />
      </Card>
    </Stack>
  );
}
