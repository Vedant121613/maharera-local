import { Card, Group, Text, ThemeIcon } from '@mantine/core';
import type { ComponentType } from 'react';

interface IconComponentProps {
  size?: number;
  stroke?: number;
  color?: string;
}

interface StatCardProps {
  label: string;
  value: string;
  icon: ComponentType<IconComponentProps>;
  accent?: string;
}

export function StatCard({ label, value, icon: Icon, accent = 'teal' }: StatCardProps) {
  return (
    <Card padding="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" tt="uppercase" fw={600} c="dimmed" lh={1.3}>
            {label}
          </Text>
          <Text size="1.65rem" fw={700} ff="monospace" mt={4}>
            {value}
          </Text>
        </div>
        <ThemeIcon variant="light" color={accent} size={38} radius="sm">
          <Icon size={20} stroke={1.75} />
        </ThemeIcon>
      </Group>
    </Card>
  );
}
