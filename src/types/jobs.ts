import { BaseCrawlRequest, CrawlResultData } from './crawl';

export type CrawlJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface CrawlJobRecord {
  jobId: string;
  status: CrawlJobStatus;
  progress: number;
  currentStep?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  params: BaseCrawlRequest;
}

export interface CrawlResultRecord {
  jobId: string;
  data: CrawlResultData;
  storedAt: string;
}
