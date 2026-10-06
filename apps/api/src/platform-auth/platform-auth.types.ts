export type PlatformAuthUser = {
  id: string;
  email: string;
  name: string;
  totpEnabled: boolean;
};

export type PlatformPendingPurpose = 'verify' | 'enroll';

export type PlatformPendingPayload = {
  sub: string;
  purpose: PlatformPendingPurpose;
};
