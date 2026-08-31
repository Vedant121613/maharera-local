import { Avatar, Group, Text, Tooltip } from '@mantine/core';
import { IconCircleFilled, IconSettings } from '@tabler/icons-react';
import { USE_MOCK_DATA } from '../../api/client';

export function Header() {
  return (
    <Group h="100%" px="lg" justify="space-between">
      <Group gap={8}>
        <Text fw={700} size="sm">
          RERA Data Dashboard
        </Text>
        <Tooltip
          label={
            USE_MOCK_DATA
              ? 'No backend configured — showing mock data (VITE_API_BASE_URL is empty)'
              : 'Connected to backend API'
          }
        >
          <Group gap={4}>
            <IconCircleFilled size={8} color={USE_MOCK_DATA ? 'var(--mantine-color-yellow-6)' : 'var(--mantine-color-teal-6)'} />
            <Text size="xs" c="dimmed">
              {USE_MOCK_DATA ? 'Mock data mode' : 'Live'}
            </Text>
          </Group>
        </Tooltip>
      </Group>

      <Group gap="md">
        <IconSettings size={18} color="var(--mantine-color-gray-6)" style={{ cursor: 'pointer' }} />
        <Group gap={8}>
          <Avatar radius="xl" size={30} color="teal">
            OP
          </Avatar>
          <Text size="sm" fw={500}>
            Operator
          </Text>
        </Group>
      </Group>
    </Group>
  );
}
