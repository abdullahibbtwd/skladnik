import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { usePermissions } from '../../lib/permissions';

export const SettingsLayout: React.FC = () => {
  const { t } = useTranslation();
  const permissions = usePermissions();

  const tabs = [
    { to: '/app/settings', label: t('settingsNav.account'), end: true },
    ...(permissions.companySettings
      ? [
          { to: '/app/settings/company', label: t('settingsNav.company'), end: false },
          { to: '/app/settings/documents', label: t('settingsNav.documents'), end: false },
          { to: '/app/settings/stock-rules', label: t('settingsNav.stockRules'), end: false },
        ]
      : []),
    { to: '/app/settings/sites', label: t('settingsNav.sites'), end: false },
    ...(permissions.users ? [{ to: '/app/settings/users', label: t('settingsNav.users'), end: false }] : []),
    ...(permissions.masterData
      ? [
          { to: '/app/settings/groups', label: t('settingsNav.groups'), end: false },
          { to: '/app/settings/partners', label: t('settingsNav.partners'), end: false },
          { to: '/app/settings/units', label: t('settingsNav.units'), end: false },
        ]
      : []),
    ...(permissions.audit ? [{ to: '/app/settings/activity', label: t('settingsNav.activity'), end: false }] : []),
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'rounded-xl px-3.5 py-2 font-display text-[0.82rem] font-medium transition-all',
                isActive ? 'bg-indigo-50 text-ops-accent' : 'text-slate-500 hover:bg-ops-canvas hover:text-ops-ink',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
};
