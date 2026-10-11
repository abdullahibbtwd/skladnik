import { apiBadRequest } from '../common/api-error';

export function invalidActivationCodeError() {
  return apiBadRequest('INVALID_CODE', 'Invalid activation code');
}

export function activationCodeAlreadyUsedError(usedAt: Date) {
  return apiBadRequest('CODE_ALREADY_USED', 'Activation code already used', {
    usedAt: usedAt.toISOString(),
  });
}

export function eikMismatchBlockedError(buyerEik: string, companyEik: string | null) {
  return apiBadRequest('EIK_MISMATCH', 'Activation code buyer EIK does not match this company', {
    buyerEik,
    companyEik: companyEik ?? '',
  });
}

export function eikMismatchConfirmRequiredError(buyerEik: string, companyEik: string | null) {
  return apiBadRequest(
    'EIK_MISMATCH_CONFIRM_REQUIRED',
    'Confirm activation despite buyer EIK mismatch',
    {
      buyerEik,
      companyEik: companyEik ?? '',
    },
  );
}

export function invalidStatusTransitionError(from: string, to: string) {
  return apiBadRequest(
    'INVALID_STATUS_TRANSITION',
    `Cannot change status from ${from} to ${to}`,
    { from, to },
  );
}
