import { Button, Tooltip } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';

interface ExportButtonProps {
  label: string;
  tooltip: string;
  onExport: () => Promise<void>;
}

export function ExportButton({ label, tooltip, onExport }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onExport();
      notifications.show({ message: 'Export ready — check your downloads.', color: 'teal' });
    } catch {
      notifications.show({ message: 'Export failed. Please try again.', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip label={tooltip} withArrow position="bottom">
      <Button
        variant="default"
        leftSection={<IconDownload size={16} />}
        onClick={handleClick}
        loading={loading}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
