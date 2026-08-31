import { useEffect, useState } from 'react';
import { Button, Card, Group, SimpleGrid, Select, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconDatabase, IconFolders, IconLink, IconMapPin, IconPlayerPlay } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { fetchDashboardStats, fetchDistrictStates, setWorkerAction } from '../api/scrapingApi';
import type { DashboardStats, DistrictScrapingState, WorkerAction, WorkerKind } from '../types';
import { StatCard } from '../components/common/StatCard';
import { DistrictScrapingTable } from '../components/scraping/DistrictScrapingTable';
import { LoadingState, ErrorState } from '../components/common/AsyncStates';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { DISTRICTS } from '../mocks/districts';
import { formatNumber } from '../utils/exportUtils';

export default function ScrapingPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [districts, setDistricts] = useState<DistrictScrapingState[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>('loading');
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    districtId: number;
    districtName: string;
    worker: WorkerKind;
    action: WorkerAction;
  } | null>(null);

  const load = async () => {
    setLoadState('loading');
    const [statsRes, districtsRes] = await Promise.all([fetchDashboardStats(), fetchDistrictStates()]);
    if (!statsRes.success || !districtsRes.success || !statsRes.data || !districtsRes.data) {
      setLoadState('error');
      return;
    }
    setStats(statsRes.data);
    setDistricts(districtsRes.data);
    setLoadState('success');
  };

  useEffect(() => {
    load();
  }, []);

  const runAction = async (districtId: number, worker: WorkerKind, action: WorkerAction) => {
    setPendingAction(`${districtId}-${worker}`);
    const res = await setWorkerAction(districtId, worker, action);
    if (res.success && res.data) {
      setDistricts((prev) => prev.map((d) => (d.districtId === districtId ? res.data! : d)));
      notifications.show({
        message: `${worker === 'link' ? 'Link' : 'Data'} scraping ${action === 'stop' ? 'stopped' : 'started'}.`,
        color: 'teal',
      });
    } else {
      notifications.show({ message: 'Action failed. Please try again.', color: 'red' });
    }
    setPendingAction(null);
  };

  const handleWorkerAction = (districtId: number, worker: WorkerKind, action: WorkerAction) => {
    // Stop is destructive-ish (interrupts a running job) — confirm it.
    if (action === 'stop') {
      const districtName = districts.find((d) => d.districtId === districtId)?.district ?? '';
      setConfirmTarget({ districtId, districtName, worker, action });
      return;
    }
    runAction(districtId, worker, action);
  };

  const handleStartSelected = () => {
    const district = DISTRICTS.find((d) => d.name === selectedDistrict);
    if (!district) return;
    runAction(district.id, 'link', 'start');
  };

  if (loadState === 'loading') return <LoadingState label="Loading dashboard…" />;
  if (loadState === 'error') return <ErrorState message="Unable to load scraping dashboard." onRetry={load} />;

  return (
    <Stack gap="xl">
      <div>
        <Title order={2} mb={4}>
          Scraping Control
        </Title>
        <Text c="dimmed" size="sm">
          Monitor and control link/data scraping progress across all Maharashtra districts.
        </Text>
      </div>

      {stats && (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 5 }} spacing="md">
          <StatCard label="Districts" value={formatNumber(stats.totalDistricts)} icon={IconMapPin} />
          <StatCard label="Projects" value={formatNumber(stats.totalProjects)} icon={IconFolders} accent="grape" />
          <StatCard label="Links" value={formatNumber(stats.totalLinks)} icon={IconLink} accent="blue" />
          <StatCard label="Data Scraped" value={formatNumber(stats.totalDataScraped)} icon={IconDatabase} accent="green" />
          <StatCard label="Failed" value={formatNumber(stats.totalFailed)} icon={IconAlertTriangle} accent="red" />
        </SimpleGrid>
      )}

      <Card padding="lg">
        <Text fw={600} mb="sm">
          Start scraping for a district
        </Text>
        <Group>
          <Select
            placeholder="Select district"
            data={DISTRICTS.map((d) => d.name)}
            value={selectedDistrict}
            onChange={setSelectedDistrict}
            searchable
            w={280}
          />
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            color="teal"
            disabled={!selectedDistrict}
            onClick={handleStartSelected}
            loading={
              !!selectedDistrict &&
              pendingAction === `${DISTRICTS.find((d) => d.name === selectedDistrict)?.id}-link`
            }
          >
            Start Scraping
          </Button>
        </Group>
      </Card>

      <Card padding="lg">
        <Text fw={600} mb="md">
          District-wise control
        </Text>
        <DistrictScrapingTable districts={districts} pendingAction={pendingAction} onWorkerAction={handleWorkerAction} />
      </Card>

      <ConfirmDialog
        opened={!!confirmTarget}
        title={`Stop ${confirmTarget?.worker === 'link' ? 'link' : 'data'} scraping?`}
        message={`Are you sure you want to stop ${
          confirmTarget?.worker === 'link' ? 'link' : 'data'
        } scraping for ${confirmTarget?.districtName}?`}
        confirmLabel="Stop Scraping"
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) runAction(confirmTarget.districtId, confirmTarget.worker, confirmTarget.action);
        }}
      />
    </Stack>
  );
}
