import { Card, Group, Stack, Text, Title } from '@mantine/core';
import { exportLinks, fetchLinks, getAllMockLinksForExport, uploadLinksSql } from '../api/linksApi';
import type { LinkRecord, UploadResult } from '../types';
import { DataTable, type DataTableColumn } from '../components/common/DataTable';
import { useTableData } from '../hooks/useTableData';
import { StatusBadge } from '../components/common/StatusBadge';
import { ExportButton } from '../components/common/ExportButton';
import { FileUpload } from '../components/common/FileUpload';
import { DISTRICTS } from '../mocks/districts';
import { downloadAsExcel, formatDateTime } from '../utils/exportUtils';
import { useState } from 'react';
import { Alert } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { Anchor } from '@mantine/core';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'error', label: 'Error' },
];

const COLUMNS: DataTableColumn<LinkRecord>[] = [
  { key: 'srNo', label: 'Sr. No.', sortable: true, render: (r) => r.srNo },
  { key: 'district', label: 'District', sortable: true, render: (r) => r.district },
  { key: 'taluka', label: 'Taluka', render: (r) => r.taluka },
  { key: 'village', label: 'Village', render: (r) => r.village },
  { key: 'reraId', label: 'RERA ID', render: (r) => <Text ff="monospace" size="sm">{r.reraId}</Text> },
  { key: 'projectName', label: 'Project Name', sortable: true, render: (r) => r.projectName },
  {
    key: 'projectUrl',
    label: 'Project URL',
    render: (r) => (
      <Anchor href={r.projectUrl} target="_blank" size="sm" c="teal">
        View
      </Anchor>
    ),
  },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'scrapedAt', label: 'Scraped At', sortable: true, render: (r) => formatDateTime(r.scrapedAt) },
];

export default function LinksPage() {
  const table = useTableData<LinkRecord>({ fetcher: fetchLinks });
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} mb={4}>
            Links
          </Title>
          <Text c="dimmed" size="sm">
            Project links collected by the Link Worker.
          </Text>
        </div>
        <ExportButton
          label="Download Excel"
          tooltip="Export the currently available link data as Excel"
          onExport={async () => {
            const res = await exportLinks();
            if (res.success) downloadAsExcel(getAllMockLinksForExport(), 'links-export.xlsx');
          }}
        />
      </Group>

      <Card padding="lg">
        <Text fw={600} mb={4}>
          Upload SQL
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Upload the SQL file generated locally by the Link Worker. The file is sent to the backend
          as-is for validation and import — the browser never executes SQL.
        </Text>
        <FileUpload
          accept={['.sql']}
          helperText="Supported: .sql"
          onUpload={async (file, onProgress) => {
            const res = await uploadLinksSql(file, onProgress);
            if (res.success && res.data) setLastUpload(res.data);
          }}
        />
        {lastUpload && (
          <Alert icon={<IconCircleCheck size={16} />} color="teal" variant="light" mt="md" radius="sm">
            <Group gap="xl">
              <Text size="sm">
                District: <b>{lastUpload.district}</b>
              </Text>
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
          columns={COLUMNS}
          rows={table.rows}
          rowKey={(r) => r.reraId}
          status={table.status}
          onRetry={table.refetch}
          search={table.search}
          onSearchChange={table.setSearch}
          districtFilter={table.district}
          onDistrictFilterChange={table.setDistrict}
          districtOptions={DISTRICTS.map((d) => d.name)}
          statusFilter={table.statusFilter}
          onStatusFilterChange={table.setStatusFilter}
          statusOptions={STATUS_OPTIONS}
          sortColumn={table.sortColumn}
          sortDirection={table.sortDirection}
          onSort={table.handleSort}
          page={table.page}
          totalPages={table.totalPages}
          onPageChange={table.setPage}
          totalItems={table.totalItems}
        />
      </Card>
    </Stack>
  );
}
