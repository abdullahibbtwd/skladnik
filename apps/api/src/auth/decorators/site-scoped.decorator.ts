import { SetMetadata } from '@nestjs/common';

export const SITE_SCOPED_KEY = 'siteScoped';

/** Require a siteId param/query/body that the caller is allowed to access. */
export const SiteScoped = (field = 'siteId') => SetMetadata(SITE_SCOPED_KEY, field);
