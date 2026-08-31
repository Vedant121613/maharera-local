/**
 * TEMPORARY MOCK DATA
 * -------------------
 * Everything in this file stands in for the future Backend API
 * (`src/api/*`). Once the backend exists, delete/replace these
 * generators — the components and hooks that consume them are already
 * written against the real `types/*` shapes and the `ApiResponse<T>` /
 * `PaginatedResponse<T>` envelopes, so no UI rewrite is required.
 */
import type {
  BasicDataRecord,
  DashboardStats,
  DistrictScrapingState,
  DynamicColumn,
  DynamicTableResponse,
  LinkRecord,
  RecordStatus,
  WorkerStatus,
} from '../types';
import { DISTRICTS } from './districts';

// Simple seeded PRNG so mock numbers stay stable across renders/reloads.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260830);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

const RECORD_STATUSES: RecordStatus[] = ['active', 'pending', 'inactive', 'error'];

function buildDistrictState(districtId: number, name: string): DistrictScrapingState {
  // Larger districts (Mumbai/Pune/Thane/Nagpur) get bigger volumes for realism.
  const majorDistricts = ['Pune', 'Mumbai City', 'Mumbai Suburban', 'Thane', 'Nagpur'];
  const base = majorDistricts.includes(name) ? 4000 : 400 + Math.floor(rand() * 1800);

  const totalProjects = base + Math.floor(rand() * 600);
  const projectsProcessed = Math.floor(totalProjects * (0.55 + rand() * 0.45));
  const linksFailed = Math.floor(projectsProcessed * rand() * 0.05);
  const linksFound = projectsProcessed - linksFailed;

  const totalLinks = linksFound;
  const dataFailed = Math.floor(totalLinks * rand() * 0.04);
  const dataScraped = Math.floor(totalLinks * (0.5 + rand() * 0.48)) - dataFailed;
  const dataPending = Math.max(totalLinks - dataScraped - dataFailed, 0);

  const linkStatus =
    projectsProcessed >= totalProjects
      ? 'completed'
      : pick<WorkerStatus>(['running', 'paused', 'stopped', 'pending', 'failed']);
  const dataStatus =
    dataScraped + dataFailed >= totalLinks && totalLinks > 0
      ? 'completed'
      : pick<WorkerStatus>(['running', 'paused', 'stopped', 'pending', 'failed']);

  return {
    district: name,
    districtId,
    linkStatus,
    dataStatus,
    linkProgress: {
      totalProjects,
      projectsProcessed,
      linksFound: Math.max(linksFound, 0),
      linksFailed,
    },
    dataProgress: {
      totalLinks,
      dataScraped: Math.max(dataScraped, 0),
      dataPending,
      dataFailed,
    },
    lastUpdated: new Date(Date.now() - Math.floor(rand() * 1000 * 60 * 60 * 24)).toISOString(),
  };
}

export const MOCK_DISTRICT_STATES: DistrictScrapingState[] = DISTRICTS.map((d) =>
  buildDistrictState(d.id, d.name)
);

export function getMockDashboardStats(): DashboardStats {
  return MOCK_DISTRICT_STATES.reduce<DashboardStats>(
    (acc, d) => ({
      totalDistricts: acc.totalDistricts + 1,
      totalProjects: acc.totalProjects + d.linkProgress.totalProjects,
      totalLinks: acc.totalLinks + d.linkProgress.linksFound,
      totalDataScraped: acc.totalDataScraped + d.dataProgress.dataScraped,
      totalFailed:
        acc.totalFailed + d.linkProgress.linksFailed + d.dataProgress.dataFailed,
    }),
    { totalDistricts: 0, totalProjects: 0, totalLinks: 0, totalDataScraped: 0, totalFailed: 0 }
  );
}

const TALUKAS = ['Haveli', 'Andheri', 'Kalyan', 'Panvel', 'Vasai', 'Baramati', 'Karvir'];
const VILLAGES = ['Wagholi', 'Undri', 'Kharadi', 'Ambegaon', 'Hinjewadi', 'Wakad', 'Katraj'];
const PROMOTERS = [
  'Shree Balaji Developers',
  'Kohinoor Group',
  'Kumar Properties',
  'Godrej Properties Ltd',
  'Rohan Builders',
  'Nyati Group',
  'VTP Realty',
];
const PROJECT_STATUSES = ['New Project', 'Extended Project', 'Lapsed', 'Ongoing'];

export function generateMockLinks(count: number): LinkRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const district = pick(DISTRICTS).name;
    return {
      srNo: i + 1,
      district,
      taluka: pick(TALUKAS),
      village: pick(VILLAGES),
      reraId: `P5${String(Math.floor(rand() * 900000000) + 100000000)}`,
      projectName: `${pick(['Shree', 'Om', 'Krishna', 'Silver', 'Green', 'Sunrise'])} ${pick([
        'Residency',
        'Heights',
        'Enclave',
        'Towers',
        'Meadows',
      ])}`,
      projectUrl: `https://maharera.mahaonline.gov.in/project/${1000 + i}`,
      status: pick(RECORD_STATUSES),
      scrapedAt: new Date(Date.now() - Math.floor(rand() * 1000 * 60 * 60 * 24 * 30)).toISOString(),
    };
  });
}

export function generateMockBasicData(count: number): BasicDataRecord[] {
  return Array.from({ length: count }, () => {
    const district = pick(DISTRICTS).name;
    return {
      reraId: `P5${String(Math.floor(rand() * 900000000) + 100000000)}`,
      projectName: `${pick(['Shree', 'Om', 'Krishna', 'Silver', 'Green', 'Sunrise'])} ${pick([
        'Residency',
        'Heights',
        'Enclave',
        'Towers',
        'Meadows',
      ])}`,
      district,
      taluka: pick(TALUKAS),
      village: pick(VILLAGES),
      promoter: pick(PROMOTERS),
      registrationDate: new Date(
        Date.now() - Math.floor(rand() * 1000 * 60 * 60 * 24 * 900)
      ).toISOString().slice(0, 10),
      projectStatus: pick(PROJECT_STATUSES),
    };
  });
}

const CLEANED_COLUMNS: DynamicColumn[] = [
  { key: 'reraId', label: 'RERA ID' },
  { key: 'projectName', label: 'Project Name' },
  { key: 'district', label: 'District' },
  { key: 'promoter', label: 'Promoter' },
  { key: 'possessionDate', label: 'Possession Date' },
  { key: 'totalUnits', label: 'Total Units' },
  { key: 'unitsSold', label: 'Units Sold' },
  { key: 'status', label: 'Status' },
];

export function generateMockCleanedData(count: number): DynamicTableResponse {
  const rows = Array.from({ length: count }, () => {
    const totalUnits = 40 + Math.floor(rand() * 300);
    return {
      reraId: `P5${String(Math.floor(rand() * 900000000) + 100000000)}`,
      projectName: `${pick(['Shree', 'Om', 'Krishna', 'Silver', 'Green', 'Sunrise'])} ${pick([
        'Residency',
        'Heights',
        'Enclave',
        'Towers',
        'Meadows',
      ])}`,
      district: pick(DISTRICTS).name,
      promoter: pick(PROMOTERS),
      possessionDate: new Date(
        Date.now() + Math.floor(rand() * 1000 * 60 * 60 * 24 * 900)
      ).toISOString().slice(0, 10),
      totalUnits,
      unitsSold: Math.floor(totalUnits * rand()),
      status: pick(PROJECT_STATUSES),
    };
  });
  return { columns: CLEANED_COLUMNS, rows };
}
