import { Button, Group } from '@mantine/core';
import { IconPlayerPlay, IconPlayerStop, IconRotateClockwise2 } from '@tabler/icons-react';
import type { WorkerAction, WorkerStatus } from '../../types';

interface WorkerControlButtonProps {
  status: WorkerStatus;
  loading?: boolean;
  onAction: (action: WorkerAction) => void;
}

/** Renders the correct action button for the current worker status. */
export function WorkerControlButton({ status, loading, onAction }: WorkerControlButtonProps) {
  if (status === 'running') {
    return (
      <Button
        size="xs"
        color="red"
        variant="light"
        leftSection={<IconPlayerStop size={14} />}
        loading={loading}
        onClick={() => onAction('stop')}
      >
        Stop
      </Button>
    );
  }
  if (status === 'paused') {
    return (
      <Button
        size="xs"
        color="teal"
        variant="light"
        leftSection={<IconPlayerPlay size={14} />}
        loading={loading}
        onClick={() => onAction('resume')}
      >
        Resume
      </Button>
    );
  }
  if (status === 'completed') {
    return (
      <Button
        size="xs"
        variant="default"
        leftSection={<IconRotateClockwise2 size={14} />}
        loading={loading}
        onClick={() => onAction('restart')}
      >
        Restart
      </Button>
    );
  }
  // pending, stopped, failed
  return (
    <Button
      size="xs"
      color="teal"
      variant="light"
      leftSection={<IconPlayerPlay size={14} />}
      loading={loading}
      onClick={() => onAction('start')}
    >
      Start
    </Button>
  );
}

export function ButtonGroupWrapper({ children }: { children: React.ReactNode }) {
  return <Group gap={6}>{children}</Group>;
}
