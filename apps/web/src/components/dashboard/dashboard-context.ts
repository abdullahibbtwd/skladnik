import { createContext, useContext } from 'react';
import type { DashboardState, StockLine } from '../../lib/dashboard-data';

export type DashboardContextValue = {
  siteId: string;
  setSiteId: (id: string) => void;
  data: DashboardState;
  onScan: () => void;
  startDocument: (type: 'RECEIPT' | 'PROTOCOL') => void;
  /** Opens a write-off draft prefilled with the whole remaining batch. */
  writeOff: (line: StockLine) => void;
  markReviewed: (id: string) => void;
};

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error('useDashboard must be used inside the dashboard');
  return value;
}
