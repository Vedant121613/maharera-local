import { Button, Center, Loader, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconDatabaseOff, IconRefresh } from '@tabler/icons-react';

export function LoadingState({ label = 'Loading data…' }: { label?: string }) {
  return (
    <Center py={60}>
      <Stack align="center" gap="xs">
        <Loader color="teal" size="sm" />
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Center>
  );
}

export function EmptyState({
  title = 'No records found',
  description = 'Try adjusting your search or filters, or check back once scraping has produced data.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Center py={60}>
      <Stack align="center" gap={4} maw={360}>
        <IconDatabaseOff size={32} stroke={1.5} color="var(--mantine-color-gray-5)" />
        <Text fw={600} mt={8}>
          {title}
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {description}
        </Text>
      </Stack>
    </Center>
  );
}

export function ErrorState({
  message = 'Unable to load data.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Center py={60}>
      <Stack align="center" gap={4} maw={360}>
        <IconAlertTriangle size={32} stroke={1.5} color="var(--mantine-color-red-6)" />
        <Text fw={600} mt={8}>
          {message}
        </Text>
        {onRetry && (
          <Button
            variant="light"
            color="teal"
            size="xs"
            mt="sm"
            leftSection={<IconRefresh size={14} />}
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
      </Stack>
    </Center>
  );
}
