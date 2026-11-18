export const WELCOME_QUEUE = 'welcome-mail';
export const WELCOME_JOB_SEND = 'send-welcome';

export const WELCOME_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};

export function welcomeJobId(userId: string) {
  return `welcome-${userId}`;
}

export type WelcomeJobData = {
  userId: string;
};
