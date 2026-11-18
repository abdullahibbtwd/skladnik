export const FIRST_SCAN_NUDGE_QUEUE = 'first-scan-nudge';
export const FIRST_SCAN_NUDGE_JOB = 'send-first-scan-nudge';

export const FIRST_SCAN_NUDGE_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};

export function firstScanNudgeJobId(companyId: string) {
  return `first-scan-nudge-${companyId}`;
}

export type FirstScanNudgeJobData = {
  companyId: string;
};
