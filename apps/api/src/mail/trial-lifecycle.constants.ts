export const TRIAL_LIFECYCLE_QUEUE = 'trial-lifecycle-mail';
export const TRIAL_ENDING_JOB = 'send-trial-ending';
export const TRIAL_ENDED_JOB = 'send-trial-ended';

export const TRIAL_LIFECYCLE_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};

export function trialEndingJobId(companyId: string) {
  return `trial-ending-${companyId}`;
}

export function trialEndedJobId(companyId: string) {
  return `trial-ended-${companyId}`;
}

export type TrialLifecycleJobData = {
  companyId: string;
};
