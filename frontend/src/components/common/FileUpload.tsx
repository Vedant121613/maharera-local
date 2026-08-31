import { Dropzone } from '@mantine/dropzone';
import { ActionIcon, Alert, Group, Progress, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconAlertCircle,
  IconCircleCheck,
  IconFileUpload,
  IconFileTypeSql,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { formatFileSize, validateUploadFile } from '../../utils/fileValidation';
import type { UploadProgressState } from '../../types';

interface FileUploadProps {
  accept: string[]; // e.g. ['.sql'] or ['.csv']
  helperText: string;
  onUpload: (file: File, onProgress: (pct: number) => void) => Promise<void>;
}

export function FileUpload({ accept, helperText, onUpload }: FileUploadProps) {
  const [state, setState] = useState<UploadProgressState>({ status: 'idle', progress: 0 });

  const handleFile = async (file: File) => {
    const validation = validateUploadFile(file, accept);
    if (!validation.valid) {
      setState({ status: 'error', progress: 0, fileName: file.name, error: validation.error });
      return;
    }

    setState({ status: 'uploading', progress: 0, fileName: file.name, fileSize: file.size });
    try {
      await onUpload(file, (pct) => setState((s) => ({ ...s, progress: pct })));
      setState((s) => ({ ...s, status: 'success', progress: 100 }));
    } catch {
      setState((s) => ({ ...s, status: 'error', error: 'Upload failed. Please try again.' }));
    }
  };

  const reset = () => setState({ status: 'idle', progress: 0 });

  if (state.status === 'uploading') {
    return (
      <Stack gap={6} py="md">
        <Group justify="space-between">
          <Group gap={8}>
            <IconFileTypeSql size={18} color="var(--mantine-color-teal-6)" />
            <Text size="sm" fw={500}>
              {state.fileName}
            </Text>
            <Text size="xs" c="dimmed">
              {state.fileSize ? formatFileSize(state.fileSize) : ''}
            </Text>
          </Group>
          <Text size="xs" ff="monospace" c="dimmed">
            {state.progress}%
          </Text>
        </Group>
        <Progress value={state.progress} color="teal" size="sm" radius="xs" animated />
      </Stack>
    );
  }

  if (state.status === 'success') {
    return (
      <Alert
        icon={<IconCircleCheck size={18} />}
        color="green"
        variant="light"
        radius="sm"
        title="Upload complete"
        withCloseButton
        onClose={reset}
      >
        <Text size="sm">{state.fileName} was uploaded successfully.</Text>
      </Alert>
    );
  }

  if (state.status === 'error') {
    return (
      <Alert
        icon={<IconAlertCircle size={18} />}
        color="red"
        variant="light"
        radius="sm"
        title="Upload failed"
        withCloseButton
        onClose={reset}
      >
        <Text size="sm">{state.error}</Text>
      </Alert>
    );
  }

  return (
    <Dropzone
      onDrop={(files) => files[0] && handleFile(files[0])}
      accept={{}}
      maxSize={200 * 1024 ** 2}
      radius="sm"
      style={{ borderStyle: 'dashed' }}
    >
      <Group justify="center" gap="md" py="lg" style={{ pointerEvents: 'none' }}>
        <ThemeIcon variant="light" color="teal" size={44} radius="sm">
          <IconFileUpload size={22} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            Drag file here, or browse
          </Text>
          <Text size="xs" c="dimmed">
            {helperText}
          </Text>
        </Stack>
      </Group>
    </Dropzone>
  );
}

export function UploadRemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <ActionIcon variant="subtle" color="gray" onClick={onRemove}>
      <IconX size={16} />
    </ActionIcon>
  );
}
