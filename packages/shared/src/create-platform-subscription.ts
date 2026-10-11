import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from './subscription';
import { isValidBgVatNumber, isValidEik, normaliseEik, normaliseTaxId } from './tax-ids';

/** Stable field-error codes for create-subscription (API + UI i18n). */
export const CREATE_SUBSCRIPTION_FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID_PLAN',
  'INVALID_MAX_USERS',
  'INVALID_TERM_MONTHS',
  'INVALID_PRICE',
  'INVALID_CURRENCY',
  'INVALID_VAT',
  'INVALID_BUYER_EIK',
  'INVALID_EMAIL',
] as const;
export type CreateSubscriptionFieldErrorCode = (typeof CREATE_SUBSCRIPTION_FIELD_ERROR_CODES)[number];

export type CreatePlatformSubscriptionInput = {
  plan?: unknown;
  maxUsers?: unknown;
  termMonths?: unknown;
  priceMinor?: unknown;
  currency?: unknown;
  vatRate?: unknown;
  buyerName?: unknown;
  buyerEik?: unknown;
  buyerAddress?: unknown;
  buyerEmail?: unknown;
  invoiceTitle?: unknown;
  companyNameHint?: unknown;
  contactEmail?: unknown;
  notes?: unknown;
  externalInvoiceRef?: unknown;
};

export type CreatePlatformSubscriptionFieldErrors = Partial<
  Record<
    | 'plan'
    | 'maxUsers'
    | 'termMonths'
    | 'priceMinor'
    | 'currency'
    | 'vatRate'
    | 'buyerName'
    | 'buyerEik'
    | 'buyerAddress'
    | 'buyerEmail'
    | 'invoiceTitle'
    | 'contactEmail'
    | 'externalInvoiceRef'
    | 'notes',
    CreateSubscriptionFieldErrorCode
  >
>;

/**
 * Buyer EIK / BULSTAT for SaaS proforma:
 * - 9 or 13 digits with official checksum, or
 * - optional BG-prefixed VAT (BG + 9-digit EIK or BG + 10-digit EGN/LNCH).
 */
export function isValidSubscriptionBuyerEik(raw: string): boolean {
  const normalised = normaliseTaxId(raw);
  if (!normalised) return false;
  if (normalised.startsWith('BG')) return isValidBgVatNumber(normalised);
  const eik = normaliseEik(normalised);
  return isValidEik(eik);
}

/** Digits-only EIK (or EGN/LNCH from BG VAT) stored on the invoice buyer snapshot. */
export function normaliseSubscriptionBuyerEik(raw: string): string {
  const normalised = normaliseTaxId(raw);
  if (normalised.startsWith('BG')) return normalised.slice(2);
  return normaliseEik(normalised);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Shared create-subscription validation (API + platform UI).
 * Returns every field error at once — never stop at the first failure.
 */
export function validateCreatePlatformSubscription(
  input: CreatePlatformSubscriptionInput,
): CreatePlatformSubscriptionFieldErrors {
  const errors: CreatePlatformSubscriptionFieldErrors = {};

  if (typeof input.plan !== 'string' || !(SUBSCRIPTION_PLANS as readonly string[]).includes(input.plan)) {
    errors.plan = 'INVALID_PLAN';
  }

  const maxUsers = typeof input.maxUsers === 'number' ? input.maxUsers : Number(input.maxUsers);
  if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 10_000) {
    errors.maxUsers = 'INVALID_MAX_USERS';
  }

  const termMonths = typeof input.termMonths === 'number' ? input.termMonths : Number(input.termMonths);
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120) {
    errors.termMonths = 'INVALID_TERM_MONTHS';
  }

  const priceMinor = typeof input.priceMinor === 'number' ? input.priceMinor : Number(input.priceMinor);
  if (!Number.isFinite(priceMinor) || !Number.isInteger(priceMinor) || priceMinor < 0) {
    errors.priceMinor = 'INVALID_PRICE';
  }

  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())) {
    errors.currency = 'INVALID_CURRENCY';
  }

  const vatRate = typeof input.vatRate === 'number' ? input.vatRate : Number(input.vatRate);
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    errors.vatRate = 'INVALID_VAT';
  }

  if (!isNonEmptyString(input.buyerName)) {
    errors.buyerName = 'REQUIRED';
  }

  if (!isNonEmptyString(input.buyerEik)) {
    errors.buyerEik = 'REQUIRED';
  } else if (!isValidSubscriptionBuyerEik(input.buyerEik)) {
    errors.buyerEik = 'INVALID_BUYER_EIK';
  }

  if (!isNonEmptyString(input.buyerAddress)) {
    errors.buyerAddress = 'REQUIRED';
  }

  if (!isNonEmptyString(input.buyerEmail)) {
    errors.buyerEmail = 'REQUIRED';
  } else if (!isEmail(input.buyerEmail.trim())) {
    errors.buyerEmail = 'INVALID_EMAIL';
  }

  if (input.contactEmail != null && input.contactEmail !== '' && typeof input.contactEmail === 'string') {
    if (!isEmail(input.contactEmail.trim())) {
      errors.contactEmail = 'INVALID_EMAIL';
    }
  }

  return errors;
}

export function assertValidCreatePlatformSubscription(
  input: CreatePlatformSubscriptionInput,
): asserts input is CreatePlatformSubscriptionInput & {
  plan: SubscriptionPlan;
  maxUsers: number;
  termMonths: number;
  priceMinor: number;
  currency: string;
  vatRate: number;
  buyerName: string;
  buyerEik: string;
  buyerAddress: string;
  buyerEmail: string;
} {
  const errors = validateCreatePlatformSubscription(input);
  if (Object.keys(errors).length > 0) {
    throw Object.assign(new Error('VALIDATION_FAILED'), { fieldErrors: errors });
  }
}
