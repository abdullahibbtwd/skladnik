import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EXPIRY_LEVELS, MAX_EXPIRY_WINDOW_DAYS, USER_ROLES, expiryWindowsProblem, type UserRole } from '@skladnik/shared';
import { cn } from '../../lib/cn';
import { usePermissions } from '../../lib/permissions';
import { useCompanySettingsQuery, useSaveExpiryWindows, useSavePriceOverrideRoles } from '../../lib/workspace-session';
import { FieldError } from '../PasswordField';
import { toast } from '../ui/Toaster';
import { GlassPanel, PageHeader, TONE_CLASS } from './dashboard-ui';

const LEVEL_LABEL = { watch: 'expiry.watch', warning: 'expiry.plan', urgent: 'expiry.sellNow', critical: 'expiry.pull' } as const;

const saveButtonClass =
  'inline-flex items-center gap-2 rounded-xl bg-ops-teal px-4 py-2 font-display text-[0.82rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-60';

const ExpiryWindowsForm: React.FC<{ windows: number[]; canEdit: boolean }> = ({ windows, canEdit }) => {
  const { t } = useTranslation();
  const saveWindows = useSaveExpiryWindows();
  const [draft, setDraft] = useState(windows.map(String));
  useEffect(() => setDraft(windows.map(String)), [windows]);

  const values = draft.map((value) => (value.trim() === '' ? Number.NaN : Number(value)));
  const invalid = expiryWindowsProblem(values) !== null;
  const changed = values.some((value, index) => value !== windows[index]);

  const save = async () => {
    try {
      await saveWindows.mutateAsync(values);
      toast.success(t('stockRules.windowsSaved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.couldNotSave'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {EXPIRY_LEVELS.map((level, index) => (
          <label key={level} className={cn('flex flex-col gap-1.5 rounded-xl border p-3', TONE_CLASS[level])}>
            <span className="font-display text-[0.72rem] font-medium">{t(LEVEL_LABEL[level])}</span>
            <span className="flex items-baseline gap-1.5 text-ops-ink">
              <span className="font-sans text-[0.8rem]">≤</span>
              <input
                type="number"
                min={0}
                max={MAX_EXPIRY_WINDOW_DAYS}
                value={draft[index]}
                disabled={!canEdit}
                onChange={(event) => setDraft((prev) => prev.map((value, at) => (at === index ? event.target.value : value)))}
                className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[0.9rem] outline-none focus:border-ops-teal/50"
              />
              <span className="font-sans text-[0.78rem]">{t('stockRules.days')}</span>
            </span>
          </label>
        ))}
      </div>
      {invalid && <FieldError>{t('stockRules.windowsInvalid', { max: MAX_EXPIRY_WINDOW_DAYS })}</FieldError>}
      <p className="font-sans text-[0.76rem] text-slate-500">{t('stockRules.windowsHint')}</p>
      {canEdit && (
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={invalid || !changed || saveWindows.isPending} className={saveButtonClass}>
            <Save size={15} />
            {saveWindows.isPending ? t('common.saving') : t('common.saveChanges')}
          </button>
        </div>
      )}
    </div>
  );
};

const PriceRolesForm: React.FC<{ roles: UserRole[]; canEdit: boolean }> = ({ roles, canEdit }) => {
  const { t } = useTranslation();
  const saveRoles = useSavePriceOverrideRoles();
  const [draft, setDraft] = useState<UserRole[]>(roles);
  useEffect(() => setDraft(roles), [roles]);

  const changed = draft.length !== roles.length || draft.some((role) => !roles.includes(role));

  const save = async () => {
    try {
      await saveRoles.mutateAsync(draft);
      toast.success(t('stockRules.rolesSaved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.couldNotSave'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {USER_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2 font-sans text-[0.84rem] text-ops-ink">
            <input
              type="checkbox"
              checked={role === 'OWNER' || draft.includes(role)}
              disabled={!canEdit || role === 'OWNER'}
              onChange={(event) =>
                setDraft((prev) => (event.target.checked ? [...prev, role] : prev.filter((item) => item !== role)))
              }
            />
            {t(`labels.role.${role}`)}
            {role === 'OWNER' && <span className="font-sans text-[0.72rem] text-slate-400">{t('stockRules.ownerAlways')}</span>}
          </label>
        ))}
      </div>
      <p className="font-sans text-[0.76rem] text-slate-500">{t('stockRules.rolesHint')}</p>
      {canEdit ? (
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={!changed || saveRoles.isPending} className={saveButtonClass}>
            <Save size={15} />
            {saveRoles.isPending ? t('common.saving') : t('common.saveChanges')}
          </button>
        </div>
      ) : (
        <p className="font-sans text-[0.76rem] text-slate-400">{t('stockRules.rolesOwnerOnly')}</p>
      )}
    </div>
  );
};

export const StockRulesSettings: React.FC = () => {
  const { t } = useTranslation();
  const permissions = usePermissions();
  const settings = useCompanySettingsQuery().data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={t('pages.companyEyebrow')} title={t('pages.stockRulesTitle')} description={t('pages.stockRulesDesc')} />
      <GlassPanel title={t('stockRules.windowsTitle')}>
        {settings ? (
          <ExpiryWindowsForm windows={settings.expiryWindows} canEdit={permissions.companySettingsWrite} />
        ) : (
          <p className="font-sans text-sm text-slate-500">{t('common.loading')}</p>
        )}
      </GlassPanel>
      <GlassPanel title={t('stockRules.rolesTitle')}>
        {settings ? (
          <PriceRolesForm roles={settings.priceOverrideRoles} canEdit={permissions.priceRules} />
        ) : (
          <p className="font-sans text-sm text-slate-500">{t('common.loading')}</p>
        )}
      </GlassPanel>
    </div>
  );
};
