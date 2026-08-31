import { Group, Progress, Text } from '@mantine/core';

interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  color?: string;
  size?: string;
}

export function ProgressBar({ value, label, color = 'teal', size = 'sm' }: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div>
      {label && (
        <Group justify="space-between" mb={4}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text size="xs" fw={600} ff="monospace">
            {clamped.toFixed(0)}%
          </Text>
        </Group>
      )}
      <Progress value={clamped} color={color} size={size} radius="xs" />
    </div>
  );
}
