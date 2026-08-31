import type { WorkerStatus } from './common';

/** Link Worker progress for one district */
export interface LinkScrapingProgress {
  totalProjects: number;
  projectsProcessed: number;
  linksFound: number;
  linksFailed: number;
}

/** Data Worker progress for one district */
export interface DataScrapingProgress {
  totalLinks: number;
  dataScraped: number;
  dataPending: number;
  dataFailed: number;
}

export interface DistrictScrapingState {
  district: string;
  districtId: number;
  linkStatus: WorkerStatus;
  dataStatus: WorkerStatus;
  linkProgress: LinkScrapingProgress;
  dataProgress: DataScrapingProgress;
  lastUpdated: string; // ISO timestamp
}

export interface DashboardStats {
  totalDistricts: number;
  totalProjects: number;
  totalLinks: number;
  totalDataScraped: number;
  totalFailed: number;
}

export type WorkerKind = 'link' | 'data';
export type WorkerAction = 'start' | 'stop' | 'restart' | 'resume';
