import { SetMetadata } from '@nestjs/common';

/** Routes that remain available when the company subscription is read-only or inactive. */
export const ALLOW_WITHOUT_SUBSCRIPTION_KEY = 'allowWithoutSubscription';

export const AllowWithoutSubscription = () => SetMetadata(ALLOW_WITHOUT_SUBSCRIPTION_KEY, true);
