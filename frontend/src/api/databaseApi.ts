import type { HealthStatus, DatabaseInfo, TableDetails } from '../types/database';

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_URL || '';
};

export const getApiHealth = async (): Promise<HealthStatus> => {
  try {
    const response = await fetch(`${getBaseUrl()}/api/health`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reach API server';
    return { status: 'error', error: message };
  }
};

export const getDatabaseInfo = async (): Promise<DatabaseInfo> => {
  const response = await fetch(`${getBaseUrl()}/api/database/info`);
  if (!response.ok) {
    throw new Error(`Failed to fetch database info: ${response.statusText}`);
  }
  return await response.json();
};

export const getTables = async (): Promise<string[]> => {
  const response = await fetch(`${getBaseUrl()}/api/database/tables`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tables: ${response.statusText}`);
  }
  return await response.json();
};

export const getTableDetails = async (
  tableName: string,
  page: number = 1,
  limit: number = 10
): Promise<TableDetails> => {
  const response = await fetch(
    `${getBaseUrl()}/api/database/tables/${tableName}?page=${page}&limit=${limit}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch table details: ${response.statusText}`);
  }
  return await response.json();
};