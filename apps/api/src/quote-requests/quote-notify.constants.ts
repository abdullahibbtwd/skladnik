export const QUOTE_NOTIFY_QUEUE = 'quote-notify';
export const QUOTE_NOTIFY_JOB = 'notify-quote';

export const QUOTE_NOTIFY_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
};

export function quoteNotifyJobId(quoteRequestId: string) {
  return `quote-notify-${quoteRequestId}`;
}

export type QuoteNotifyJobData = {
  quoteRequestId: string;
};
