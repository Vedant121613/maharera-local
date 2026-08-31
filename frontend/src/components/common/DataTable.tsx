import { ActionIcon, Group, Pagination, ScrollArea, Select, Table, Text, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowsSort, IconArrowUp, IconSearch } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { AsyncStatus, SortDirection } from '../../types';
import { EmptyState, ErrorState, LoadingState } from './AsyncStates';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  status: AsyncStatus;
  errorMessage?: string;
  onRetry?: () => void;

  search: string;
  onSearchChange: (v: string) => void;

  districtFilter?: string | null;
  onDistrictFilterChange?: (v: string | null) => void;
  districtOptions?: string[];

  statusFilter?: string | null;
  onStatusFilterChange?: (v: string | null) => void;
  statusOptions?: { value: string; label: string }[];

  sortColumn: string | null;
  sortDirection: SortDirection;
  onSort: (column: string) => void;

  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  status,
  errorMessage,
  onRetry,
  search,
  onSearchChange,
  districtFilter,
  onDistrictFilterChange,
  districtOptions,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  sortColumn,
  sortDirection,
  onSort,
  page,
  totalPages,
  onPageChange,
  totalItems,
}: DataTableProps<T>) {
  return (
    <div>
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <TextInput
          placeholder="Search…"
          leftSection={<IconSearch size={15} />}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          w={260}
        />
        <Group gap="sm">
          {districtOptions && onDistrictFilterChange && (
            <Select
              placeholder="District"
              data={districtOptions}
              value={districtFilter ?? null}
              onChange={onDistrictFilterChange}
              clearable
              w={180}
              comboboxProps={{ withinPortal: true }}
            />
          )}
          {statusOptions && onStatusFilterChange && (
            <Select
              placeholder="Status"
              data={statusOptions}
              value={statusFilter ?? null}
              onChange={onStatusFilterChange}
              clearable
              w={160}
              comboboxProps={{ withinPortal: true }}
            />
          )}
        </Group>
      </Group>

      {status === 'loading' && <LoadingState />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={onRetry} />}
      {status === 'empty' && <EmptyState />}

      {status === 'success' && (
        <>
          <ScrollArea type="auto" offsetScrollbars>
            <Table striped highlightOnHover miw={700}>
              <Table.Thead>
                <Table.Tr>
                  {columns.map((col) => (
                    <Table.Th
                      key={col.key}
                      style={{
                        cursor: col.sortable ? 'pointer' : undefined,
                        textAlign: col.align ?? 'left',
                        whiteSpace: 'nowrap',
                      }}
                      onClick={() => col.sortable && onSort(col.key)}
                    >
                      <Group gap={4} justify={col.align === 'right' ? 'flex-end' : 'flex-start'} wrap="nowrap">
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                          {col.label}
                        </Text>
                        {col.sortable && (
                          <ActionIcon variant="transparent" color="gray" size="xs">
                            {sortColumn === col.key ? (
                              sortDirection === 'asc' ? (
                                <IconArrowUp size={13} />
                              ) : (
                                <IconArrowDown size={13} />
                              )
                            ) : (
                              <IconArrowsSort size={13} opacity={0.4} />
                            )}
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={rowKey(row)}>
                    {columns.map((col) => (
                      <Table.Td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                        {col.render(row)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          <Group justify="space-between" mt="md">
            <Text size="xs" c="dimmed">
              {totalItems.toLocaleString('en-IN')} record{totalItems === 1 ? '' : 's'}
            </Text>
            {totalPages > 1 && (
              <Pagination total={totalPages} value={page} onChange={onPageChange} size="sm" color="teal" />
            )}
          </Group>
        </>
      )}
    </div>
  );
}
