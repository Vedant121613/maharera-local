import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Text, Button, Select, Group, Stack, Badge, Table, Progress, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000/api';

interface WorkerNode {
  worker_id: string;
  status: string;
  last_heartbeat: string;
  is_active: boolean;
}

interface Job {
  id: number;
  job_type: string;
  district: string;
  status: string;
  processed_items: number;
  total_items: number;
  created_at: string;
}

export default function ScraperControl() {
  const [workers, setWorkers] = useState<WorkerNode[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [district, setDistrict] = useState<string>('Pune');
  const [jobType, setJobType] = useState<string>('LINK_SCRAPER');
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(5);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const [workersRes, jobsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/worker/status`),
        axios.get(`${API_BASE_URL}/jobs`),
      ]);
      setWorkers(workersRes.data?.workers || []);
      setJobs(jobsRes.data?.jobs || []);
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
      await axios.post(`${API_BASE_URL}/jobs`, {
        job_type: jobType,
        district,
        start_page: Number(startPage),
        end_page: Number(endPage),
      });
      fetchStatus();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to trigger job.');
    }
  };

  const handleStopJob = async (jobId: number) => {
    try {
      await axios.post(`${API_BASE_URL}/jobs/${jobId}/stop`);
      fetchStatus();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to stop job.');
    }
  };

  return (
    <Stack gap="md">
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="System Alert" color="red" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {/* Worker Node Card */}
      <Card withBorder padding="md" radius="md">
        <Text fw={600} size="lg" mb="xs">Live PC Worker Status</Text>
        <Group gap="xs">
          {workers.length === 0 ? (
            <Badge color="gray">No Worker Connected</Badge>
          ) : (
            workers.map((w) => (
              <Badge key={w.worker_id} color={w.status === 'ONLINE' ? 'teal' : w.status === 'BUSY' ? 'blue' : 'red'}>
                {w.worker_id} ({w.status}) - Last Seen: {new Date(w.last_heartbeat).toLocaleTimeString()}
              </Badge>
            ))
          )}
        </Group>
      </Card>

      {/* Job Trigger Card */}
      <Card withBorder padding="md" radius="md">
        <Text fw={600} size="lg" mb="sm">Trigger New Server Job</Text>
        <Group align="flex-end">
          <Select
            label="Scraper Type"
            value={jobType}
            onChange={(val) => setJobType(val || 'LINK_SCRAPER')}
            data={[
              { value: 'LINK_SCRAPER', label: 'Link Scraper' },
              { value: 'DATA_SCRAPER', label: 'Data Scraper' },
            ]}
          />
          <Select
            label="District"
            value={district}
            onChange={(val) => setDistrict(val || 'Pune')}
            data={['Pune', 'Mumbai Suburban', 'Thane', 'Nagpur', 'Nashik', 'Chhatrapati Sambhajinagar']}
            searchable
          />
          <Select
            label="Start Page"
            value={String(startPage)}
            onChange={(val) => setStartPage(Number(val) || 1)}
            data={['1', '5', '10', '15', '20']}
          />
          <Select
            label="End Page"
            value={String(endPage)}
            onChange={(val) => setEndPage(Number(val) || 5)}
            data={['5', '10', '15', '20', '50']}
          />
          <Button color="teal" onClick={handleCreateJob}>
            Queue Job
          </Button>
        </Group>
      </Card>

      {/* Active Jobs Queue Table */}
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
              <Table.Th>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6} style={{ textAlign: 'center' }}>No active or past jobs found.</Table.Td>
              </Table.Tr>
            ) : (
              jobs.map((j) => {
                const progressPct = j.total_items > 0 ? Math.round((j.processed_items / j.total_items) * 100) : 0;
                return (
                  <Table.Tr key={j.id}>
                    <Table.Td>#{j.id}</Table.Td>
                    <Table.Td>{j.job_type}</Table.Td>
                    <Table.Td>{j.district}</Table.Td>
                    <Table.Td style={{ width: '200px' }}>
                      <Progress value={progressPct} size="sm" color="blue" />
                      <Text size="xs" c="dimmed">{j.processed_items} / {j.total_items} items</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={j.status === 'COMPLETED' ? 'teal' : j.status === 'RUNNING' ? 'blue' : j.status === 'PENDING' ? 'yellow' : 'red'}>
                        {j.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {(j.status === 'PENDING' || j.status === 'RUNNING') && (
                        <Button color="red" size="xs" onClick={() => handleStopJob(j.id)}>
                          Stop
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}