import { create } from 'zustand';
import { pingApi } from './photo-sync';

const OFFLINE_RECHECK_MS = 15_000;

type ConnectivityState = {
  /** The API answered the last health ping (navigator.onLine alone can't tell). */
  reachable: boolean;
  checking: boolean;
};

export const useConnectivity = create<ConnectivityState>(() => ({ reachable: navigator.onLine, checking: false }));

let pending: Promise<boolean> | null = null;

export function checkConnectivity(): Promise<boolean> {
  pending ??= pingApi()
    .then((reachable) => {
      useConnectivity.setState({ reachable });
      return reachable;
    })
    .finally(() => {
      pending = null;
      useConnectivity.setState({ checking: false });
    });
  useConnectivity.setState({ checking: true });
  return pending;
}

/** Marks the API unreachable after a request failed at the network level, without waiting for a ping. */
export function markUnreachable() {
  useConnectivity.setState({ reachable: false });
}

let started = false;

export function startConnectivityWatch() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void checkConnectivity());
  window.addEventListener('offline', () => useConnectivity.setState({ reachable: false }));
  window.setInterval(() => {
    if (!useConnectivity.getState().reachable) void checkConnectivity();
  }, OFFLINE_RECHECK_MS);
  void checkConnectivity();
}
