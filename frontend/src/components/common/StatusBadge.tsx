import { Badge } from '@mantine/core';
import { STATUS_COLORS } from '../../theme';
import type { RecordStatus, WorkerStatus } from '../../types';

interface StatusBadgeProps {
  status: WorkerStatus | RecordStatus | string;
}

const LABELS: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  stopped: 'Stopped',
  failed: 'Failed',
  active: 'Active',
  inactive: 'Inactive',
  error: 'Error',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] ?? 'gray';
  return (
    <Badge color={color} variant={status === 'running' ? 'filled' : 'light'} size="sm" radius="sm">
      {LABELS[status] ?? status}
    </Badge>
  );
}
