import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Text, Button, Select, Group, Stack, Badge, Table, Progress, Alert, SimpleGrid } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000/api';

interface WorkerNode {
  worker_id: string;
  status: string;
  last_heartbeat: string;
}

interface Job {
  id: number;
  job_type: string;
  district: string;
  status: string;
  processed_items: number;
  total_items: number;
}

export default function ScraperControl() {
  const [workers, setWorkers] = useState<WorkerNode[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [district, setDistrict] = useState<string>('Pune');
  const [jobType, setJobType] = useState<string>('LINK_SCRAPER');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ districts: 37, projects: 74589, links: 54589, dataScraped: 40469, failed: 2707 });

  const fetchStatus = async () => {
    try {
      const [workersRes, jobsRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/worker/status`),
        axios.get(`${API_BASE_URL}/jobs`),
        axios.get(`${API_BASE_URL}/stats`).catch(() => ({ data: null }))
      ]);

      setWorkers(workersRes.data?.workers || []);
      setJobs(jobsRes.data?.jobs || []);
      if (statsRes.data) setStats(statsRes.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to sync worker status.');
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateJob = async () => {
    try {
      await axios.post(`${API_BASE_URL}/jobs`, { job_type: jobType, district });
      fetchStatus();
    } catch (err: any) {
      setError('Failed to trigger job.');
    }
  };

  return (
    <Stack gap="md">
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="System Alert" color="red" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {/* Live Worker Status */}
      <Card withBorder padding="md" radius="md">
        <Text fw={600} size="lg" mb="xs">Live PC Worker Status</Text>
        <Group gap="xs">
          {workers.length === 0 ? (
            <Badge color="gray">NO WORKER CONNECTED</Badge>
          ) : (
            workers.map((w) => (
              <Badge key={w.worker_id} color={w.status === 'ONLINE' ? 'teal' : 'red'}>
                {w.worker_id} ({w.status})
              </Badge>
            ))
          )}
        </Group>
      </Card>

      {/* Trigger Job without Start/End page */}
      <Card withBorder padding="md" radius="md">
        <Text fw={600} size="lg" mb="sm">Trigger New Server Job</Text>
        <Group align="flex-end">
          <Select
            label="Scraper Type"
            value={jobType}
            onChange={(val) => setJobType(val || 'LINK_SCRAPER')}
            data={[{ value: 'LINK_SCRAPER', label: 'Link Scraper' }, { value: 'DATA_SCRAPER', label: 'Data Scraper' }]}
          />
          <Select
            label="District"
            value={district}
            onChange={(val) => setDistrict(val || 'Pune')}
            data={['Pune', 'Mumbai Suburban', 'Thane', 'Nagpur', 'Nashik', 'Chhatrapati Sambhajinagar']}
            searchable
          />
          <Button color="teal" onClick={handleCreateJob}>Queue Job</Button>
        </Group>
      </Card>

      {/* Queue Progress Table */}
      <Card withBorder padding="md" radius="md">
        <Text fw={600} size="lg" mb="sm">Job Queue & Progress</Text>
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Job ID</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>District</Table.Th>
              <Table.Th>Progress</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.length === 0 ? (
              <Table.Tr><Table.Td colSpan={5} style={{ textAlign: 'center' }}>No active or past jobs found.</Table.Td></Table.Tr>
            ) : (
              jobs.map((j) => (
                <Table.Tr key={j.id}>
                  <Table.Td>#{j.id}</Table.Td>
                  <Table.Td>{j.job_type}</Table.Td>
                  <Table.Td>{j.district}</Table.Td>
                  <Table.Td style={{ width: '200px' }}>
                    <Progress value={j.total_items > 0 ? (j.processed_items / j.total_items) * 100 : 0} size="sm" color="blue" />
                  </Table.Td>
                  <Table.Td><Badge color={j.status === 'COMPLETED' ? 'teal' : 'blue'}>{j.status}</Badge></Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Database Statistics */}
      <SimpleGrid cols={{ base: 1, sm: 5 }} spacing="md">
        <Card withBorder padding="md"><Text size="xs" c="dimmed" fw={700}>DISTRICTS</Text><Text fw={700} size="xl">{stats.districts}</Text></Card>
        <Card withBorder padding="md"><Text size="xs" c="dimmed" fw={700}>PROJECTS</Text><Text fw={700} size="xl">{stats.projects.toLocaleString()}</Text></Card>
        <Card withBorder padding="md"><Text size="xs" c="dimmed" fw={700}>LINKS</Text><Text fw={700} size="xl">{stats.links.toLocaleString()}</Text></Card>
        <Card withBorder padding="md"><Text size="xs" c="dimmed" fw={700}>DATA SCRAPED</Text><Text fw={700} size="xl">{stats.dataScraped.toLocaleString()}</Text></Card>
        <Card withBorder padding="md"><Text size="xs" c="dimmed" fw={700}>FAILED</Text><Text fw={700} size="xl">{stats.failed.toLocaleString()}</Text></Card>
      </SimpleGrid>
    </Stack>
  );
}