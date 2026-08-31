import { ActionIcon, Box, Collapse, Group, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import type { DistrictScrapingState, WorkerAction, WorkerKind } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { ProgressBar } from '../common/ProgressBar';
import { WorkerControlButton } from './DistrictControl';
import { formatNumber } from '../../utils/exportUtils';

interface DistrictScrapingTableProps {
  districts: DistrictScrapingState[];
  pendingAction: string | null; // `${districtId}-${worker}` while a mock request is in flight
  onWorkerAction: (districtId: number, worker: WorkerKind, action: WorkerAction) => void;
}

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <Group justify="space-between" gap={4}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xs" fw={600} ff="monospace">
        {formatNumber(value)}
      </Text>
    </Group>
  );
}

export function DistrictScrapingTable({ districts, pendingAction, onWorkerAction }: DistrictScrapingTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const filtered = districts.filter((d) => d.district.toLowerCase().includes(search.toLowerCase()));

  return (
    <Box>
      <TextInput
        placeholder="Filter districts…"
        leftSection={<IconSearch size={15} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        w={260}
        mb="md"
      />
      <ScrollArea type="auto" offsetScrollbars>
        <Table striped highlightOnHover miw={880}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={32} />
              <Table.Th>District</Table.Th>
              <Table.Th>Link Scraping</Table.Th>
              <Table.Th w={220}>Link Progress</Table.Th>
              <Table.Th>Data Scraping</Table.Th>
              <Table.Th w={220}>Data Progress</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filtered.map((d) => {
              const isOpen = expanded === d.districtId;
              const linkPct =
                d.linkProgress.totalProjects === 0
                  ? 0
                  : (d.linkProgress.projectsProcessed / d.linkProgress.totalProjects) * 100;
              const dataPct =
                d.dataProgress.totalLinks === 0
                  ? 0
                  : ((d.dataProgress.dataScraped + d.dataProgress.dataFailed) / d.dataProgress.totalLinks) * 100;

              return (
                <Table.Tr key={d.districtId}>
                  <Table.Td colSpan={6} p={0}>
                    <Box px="md" py="xs">
                      <Group wrap="nowrap" align="center">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => setExpanded(isOpen ? null : d.districtId)}
                        >
                          {isOpen ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
                        </ActionIcon>

                        <Text fw={600} w={150} style={{ flexShrink: 0 }}>
                          {d.district}
                        </Text>

                        <Group w={160} gap={8} style={{ flexShrink: 0 }}>
                          <StatusBadge status={d.linkStatus} />
                          <WorkerControlButton
                            status={d.linkStatus}
                            loading={pendingAction === `${d.districtId}-link`}
                            onAction={(action) => onWorkerAction(d.districtId, 'link', action)}
                          />
                        </Group>

                        <Box w={220} style={{ flexShrink: 0 }}>
                          <ProgressBar
                            value={linkPct}
                            label={`${formatNumber(d.linkProgress.projectsProcessed)} / ${formatNumber(
                              d.linkProgress.totalProjects
                            )}`}
                          />
                        </Box>

                        <Group w={160} gap={8} style={{ flexShrink: 0 }}>
                          <StatusBadge status={d.dataStatus} />
                          <WorkerControlButton
                            status={d.dataStatus}
                            loading={pendingAction === `${d.districtId}-data`}
                            onAction={(action) => onWorkerAction(d.districtId, 'data', action)}
                          />
                        </Group>

                        <Box w={220} style={{ flexShrink: 0 }}>
                          <ProgressBar
                            value={dataPct}
                            color="grape"
                            label={`${formatNumber(
                              d.dataProgress.dataScraped + d.dataProgress.dataFailed
                            )} / ${formatNumber(d.dataProgress.totalLinks)}`}
                          />
                        </Box>
                      </Group>

                      <Collapse in={isOpen}>
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl" pt="md" pl={36}>
                          <Stack gap={4}>
                            <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={2}>
                              Link Scraping
                            </Text>
                            <StatLine label="Total Projects" value={d.linkProgress.totalProjects} />
                            <StatLine label="Projects Processed" value={d.linkProgress.projectsProcessed} />
                            <StatLine label="Project Links Found" value={d.linkProgress.linksFound} />
                            <StatLine label="Links Failed" value={d.linkProgress.linksFailed} />
                          </Stack>
                          <Stack gap={4}>
                            <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={2}>
                              Data Scraping
                            </Text>
                            <StatLine label="Total Links" value={d.dataProgress.totalLinks} />
                            <StatLine label="Data Scraped" value={d.dataProgress.dataScraped} />
                            <StatLine label="Data Pending" value={d.dataProgress.dataPending} />
                            <StatLine label="Data Failed" value={d.dataProgress.dataFailed} />
                          </Stack>
                        </SimpleGrid>
                      </Collapse>
                    </Box>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Box>
  );
}
