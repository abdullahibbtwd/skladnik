const storageKey = (user: { id: string; companyId: string }) => `skladnik.site.${user.companyId}.${user.id}`;

export function storedSiteId(user: { id: string; companyId: string } | null | undefined): string | null {
  if (!user) return null;
  try {
    return localStorage.getItem(storageKey(user));
  } catch {
    return null;
  }
}

export function persistSiteId(user: { id: string; companyId: string } | null | undefined, siteId: string) {
  if (!user) return;
  try {
    localStorage.setItem(storageKey(user), siteId);
  } catch {
    // ignore
  }
}
