import { Alert, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { exportBasicData, fetchBasicData, getAllMockBasicDataForExport, uploadBasicData } from '../api/basicDataApi';
import type { BasicDataRecord, UploadResult } from '../types';
import { DataTable, type DataTableColumn } from '../components/common/DataTable';
import { useTableData } from '../hooks/useTableData';
import { ExportButton } from '../components/common/ExportButton';
import { FileUpload } from '../components/common/FileUpload';
import { DISTRICTS } from '../mocks/districts';
import { downloadAsCsv } from '../utils/exportUtils';

const COLUMNS: DataTableColumn<BasicDataRecord>[] = [
  { key: 'reraId', label: 'RERA ID', sortable: true, render: (r) => <Text ff="monospace" size="sm">{r.reraId}</Text> },
  { key: 'projectName', label: 'Project Name', sortable: true, render: (r) => r.projectName },
  { key: 'district', label: 'District', sortable: true, render: (r) => r.district },
  { key: 'taluka', label: 'Taluka', render: (r) => r.taluka },
  { key: 'village', label: 'Village', render: (r) => r.village },
  { key: 'promoter', label: 'Promoter', render: (r) => r.promoter },
  { key: 'registrationDate', label: 'Registration Date', sortable: true, render: (r) => r.registrationDate },
  { key: 'projectStatus', label: 'Project Status', render: (r) => r.projectStatus },
];

export default function BasicDataPage() {
  const table = useTableData<BasicDataRecord>({ fetcher: fetchBasicData });
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2} mb={4}>
            Basic Data
          </Title>
          <Text c="dimmed" size="sm">
            Records produced by the Data Worker's second-pass scraping script.
          </Text>
        </div>
        <ExportButton
          label="Download CSV"
          tooltip="Export the currently available basic data as CSV"
          onExport={async () => {
            const res = await exportBasicData();
            if (res.success) downloadAsCsv(getAllMockBasicDataForExport(), 'basic-data-export.csv');
          }}
        />
      </Group>

      <Card padding="lg">
        <Text fw={600} mb={4}>
          Upload Data
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Upload the .db file produced locally by the Data Worker (or a .csv/.sql export). The
          backend validates and inserts records — nothing is written to PostgreSQL from the browser.
        </Text>
        <FileUpload
          accept={['.csv', '.sql', '.db']}
          helperText="Supported: .csv, .sql, .db"
          onUpload={async (file, onProgress) => {
            const res = await uploadBasicData(file, onProgress);
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