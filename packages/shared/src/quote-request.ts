export const QUOTE_REQUEST_STATUSES = ['NEW', 'CONTACTED', 'CLOSED'] as const;
export type QuoteRequestStatus = (typeof QUOTE_REQUEST_STATUSES)[number];

/** Allowed platform-admin status moves for quote leads. */
export const QUOTE_REQUEST_STATUS_TRANSITIONS: Record<QuoteRequestStatus, readonly QuoteRequestStatus[]> = {
  NEW: ['CONTACTED', 'CLOSED'],
  CONTACTED: ['CLOSED', 'NEW'],
  CLOSED: ['CONTACTED'],
};

export function canTransitionQuoteStatus(from: QuoteRequestStatus, to: QuoteRequestStatus): boolean {
  return (QUOTE_REQUEST_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}
