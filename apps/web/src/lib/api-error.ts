import type { TFunction } from 'i18next';
import i18n from '../i18n';
import { ApiError } from './workspace-api';

/** Translate an API error by its machine code when the client has a matching string. */
export function apiErrorText(error: unknown, fallback: string, t: TFunction = i18n.t.bind(i18n)): string {
  if (error instanceof ApiError && error.code) {
    const key = `errors.${error.code}`;
    if (i18n.exists(key)) return t(key, error.params);
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
