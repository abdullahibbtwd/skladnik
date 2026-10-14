import type { UserRole } from '@skladnik/shared';

/** Guide sections every tenant user can open. */
export type HelpSectionId = 'start' | 'roles' | 'role' | 'troubleshoot';

export type HelpTask = {
  id: string;
  /** i18n key under help.tasks.<id> */
  titleKey: string;
  /** When true, render separate Desktop / Mobile step lists. */
  splitNav?: boolean;
};

export type HelpRoleGuide = {
  role: UserRole;
  /** Short “what this role does” — shown to everyone. */
  blurbKey: string;
  /** When to ask someone in this role — shown when viewing another role. */
  askWhenKey: string;
  /** Areas of the app this role should use. */
  areasKey: string;
  /** Full how-to tasks — only rendered for the signed-in role. */
  tasks: HelpTask[];
};

export const HELP_ROLES: HelpRoleGuide[] = [
  {
    role: 'OWNER',
    blurbKey: 'help.roles.OWNER.blurb',
    askWhenKey: 'help.roles.OWNER.askWhen',
    areasKey: 'help.roles.OWNER.areas',
    tasks: [
      { id: 'ownerSites', titleKey: 'help.tasks.ownerSites.title' },
      { id: 'ownerInvite', titleKey: 'help.tasks.ownerInvite.title' },
      { id: 'ownerReceive', titleKey: 'help.tasks.ownerReceive.title', splitNav: true },
      { id: 'ownerPost', titleKey: 'help.tasks.ownerPost.title' },
      { id: 'ownerProducts', titleKey: 'help.tasks.ownerProducts.title' },
      { id: 'ownerTransfer', titleKey: 'help.tasks.ownerTransfer.title' },
      { id: 'ownerStocktake', titleKey: 'help.tasks.ownerStocktake.title' },
      { id: 'ownerTill', titleKey: 'help.tasks.ownerTill.title', splitNav: true },
      { id: 'ownerReports', titleKey: 'help.tasks.ownerReports.title' },
      { id: 'ownerVat', titleKey: 'help.tasks.ownerVat.title' },
      { id: 'ownerOpening', titleKey: 'help.tasks.ownerOpening.title' },
      { id: 'ownerSubscription', titleKey: 'help.tasks.ownerSubscription.title' },
    ],
  },
  {
    role: 'SITE_MANAGER',
    blurbKey: 'help.roles.SITE_MANAGER.blurb',
    askWhenKey: 'help.roles.SITE_MANAGER.askWhen',
    areasKey: 'help.roles.SITE_MANAGER.areas',
    tasks: [
      { id: 'mgrReceive', titleKey: 'help.tasks.mgrReceive.title', splitNav: true },
      { id: 'mgrPost', titleKey: 'help.tasks.mgrPost.title' },
      { id: 'mgrWriteoff', titleKey: 'help.tasks.mgrWriteoff.title', splitNav: true },
      { id: 'mgrTransfer', titleKey: 'help.tasks.mgrTransfer.title' },
      { id: 'mgrStocktake', titleKey: 'help.tasks.mgrStocktake.title' },
      { id: 'mgrTill', titleKey: 'help.tasks.mgrTill.title', splitNav: true },
      { id: 'mgrMinstock', titleKey: 'help.tasks.mgrMinstock.title' },
      { id: 'mgrRecipes', titleKey: 'help.tasks.mgrRecipes.title' },
      { id: 'mgrReports', titleKey: 'help.tasks.mgrReports.title' },
    ],
  },
  {
    role: 'STAFF',
    blurbKey: 'help.roles.STAFF.blurb',
    askWhenKey: 'help.roles.STAFF.askWhen',
    areasKey: 'help.roles.STAFF.areas',
    tasks: [
      { id: 'staffScan', titleKey: 'help.tasks.staffScan.title', splitNav: true },
      { id: 'staffReceive', titleKey: 'help.tasks.staffReceive.title', splitNav: true },
      { id: 'staffSubmit', titleKey: 'help.tasks.staffSubmit.title' },
      { id: 'staffWriteoff', titleKey: 'help.tasks.staffWriteoff.title', splitNav: true },
      { id: 'staffStock', titleKey: 'help.tasks.staffStock.title' },
      { id: 'staffPending', titleKey: 'help.tasks.staffPending.title' },
      { id: 'staffQueue', titleKey: 'help.tasks.staffQueue.title' },
    ],
  },
  {
    role: 'CASHIER',
    blurbKey: 'help.roles.CASHIER.blurb',
    askWhenKey: 'help.roles.CASHIER.askWhen',
    areasKey: 'help.roles.CASHIER.areas',
    tasks: [
      { id: 'cashTill', titleKey: 'help.tasks.cashTill.title', splitNav: true },
      { id: 'cashSales', titleKey: 'help.tasks.cashSales.title' },
      { id: 'cashStock', titleKey: 'help.tasks.cashStock.title' },
    ],
  },
  {
    role: 'ACCOUNTANT',
    blurbKey: 'help.roles.ACCOUNTANT.blurb',
    askWhenKey: 'help.roles.ACCOUNTANT.askWhen',
    areasKey: 'help.roles.ACCOUNTANT.areas',
    tasks: [
      { id: 'accReports', titleKey: 'help.tasks.accReports.title' },
      { id: 'accArchive', titleKey: 'help.tasks.accArchive.title' },
      { id: 'accVat', titleKey: 'help.tasks.accVat.title' },
      { id: 'accAudit', titleKey: 'help.tasks.accAudit.title' },
      { id: 'accSales', titleKey: 'help.tasks.accSales.title' },
      { id: 'accDocs', titleKey: 'help.tasks.accDocs.title' },
    ],
  },
];

export const HELP_START_TOPICS = [
  'signIn',
  'forgotPassword',
  'navigate',
  'notifications',
  'account',
  'desktopMobile',
  'permissions',
] as const;

export const HELP_TROUBLE_TOPICS = [
  'missingMenu',
  'pageRedirect',
  'cannotCreate',
  'needsApproval',
  'formBlocked',
  'reportMissing',
  'mobileControl',
] as const;

export function guideForRole(role: UserRole): HelpRoleGuide {
  return HELP_ROLES.find((g) => g.role === role) ?? HELP_ROLES[0]!;
}
