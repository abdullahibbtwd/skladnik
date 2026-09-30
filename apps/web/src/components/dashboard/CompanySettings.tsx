import React, { useEffect, useState } from 'react';
import { Building2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CompanyProfile } from '@skladnik/shared';
import { usePermissions } from '../../lib/permissions';
import { useCompanySettingsQuery, useSaveCompanyProfile } from '../../lib/workspace-session';
import { FieldError, FieldLabel, textFieldClass } from '../PasswordField';
import { toast } from '../ui/Toaster';
import { GlassPanel, PageHeader } from './dashboard-ui';
import { TaxIdFields, typedTaxIdProblems } from './TaxIdFields';

type ProfileForm = Record<keyof CompanyProfile, string>;

const toForm = (profile: CompanyProfile): ProfileForm => ({
  name: profile.name,
  eik: profile.eik ?? '',
  vatNumber: profile.vatNumber ?? '',
  address: profile.address ?? '',
  city: profile.city ?? '',
  mol: profile.mol ?? '',
  phone: profile.phone ?? '',
  email: profile.email ?? '',
});

const toProfile = (form: ProfileForm): CompanyProfile => ({
  name: form.name.trim(),
  eik: form.eik.trim() || null,
  vatNumber: form.vatNumber.trim() || null,
  address: form.address.trim() || null,
  city: form.city.trim() || null,
  mol: form.mol.trim() || null,
  phone: form.phone.trim() || null,
  email: form.email.trim() || null,
});

export const CompanySettings: React.FC = () => {
  const { t } = useTranslation();
  const canEdit = usePermissions().companySettings;
  const settingsQuery = useCompanySettingsQuery();
  const saveProfile = useSaveCompanyProfile();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = settingsQuery.data?.profile;
  useEffect(() => {
    if (profile) setForm(toForm(profile));
  }, [profile]);

  const set = (field: keyof ProfileForm) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => (prev ? { ...prev, [field]: event.target.value } : prev));

  const problems = form ? typedTaxIdProblems(form.eik, form.vatNumber) : [];
  const missing = form ? [!form.eik.trim() && t('taxId.eik'), !form.address.trim() && t('common.address')].filter(Boolean) : [];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || problems.length) return;
    setError(null);
    try {
      await saveProfile.mutateAsync(toProfile(form));
      toast.success(t('company.saved'));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('common.couldNotSave'));
    }
  };

  const field = (name: keyof ProfileForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={props.className}>
      <FieldLabel htmlFor={`company-${name}`}>{label}</FieldLabel>
      <input
        id={`company-${name}`}
        {...props}
        className={`${textFieldClass} pl-3`}
        value={form?.[name] ?? ''}
        disabled={!canEdit}
        onChange={set(name)}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={t('pages.companyEyebrow')} title={t('pages.companyTitle')} description={t('pages.companyDesc')} />

      <GlassPanel title={t('company.details')}>
        {settingsQuery.isPending || !form ? (
          <p className="font-sans text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('name', t('company.legalName'), { required: true, className: 'sm:col-span-2', placeholder: 'Демо Маркет ЕООД' })}
              <TaxIdFields
                idPrefix="company"
                eik={form.eik}
                vatNumber={form.vatNumber}
                disabled={!canEdit}
                onChange={(ids) => setForm((prev) => (prev ? { ...prev, ...ids } : prev))}
              />
              {field('address', t('common.address'), { className: 'sm:col-span-2', placeholder: 'ул. Витоша 12' })}
              {field('city', t('company.city'), { placeholder: 'София' })}
              {field('mol', t('company.mol'))}
              {field('phone', t('common.phone'), { type: 'tel' })}
              {field('email', t('common.email'), { type: 'email' })}
            </div>
            {missing.length > 0 && (
              <p className="rounded-xl border border-ops-warn/20 bg-orange-50 px-3 py-2 font-sans text-[0.78rem] text-ops-warn">
                {t('company.missing', { fields: missing.join(', ') })}
              </p>
            )}
            {error && <FieldError>{error}</FieldError>}
            {canEdit ? (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saveProfile.isPending || problems.length > 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-ops-teal px-4 py-2 font-display text-[0.82rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-60"
                >
                  <Save size={15} />
                  {saveProfile.isPending ? t('common.saving') : t('common.saveChanges')}
                </button>
              </div>
            ) : (
              <p className="flex items-center gap-2 font-sans text-[0.78rem] text-slate-400">
                <Building2 size={14} />
                {t('company.ownerOnly')}
              </p>
            )}
          </form>
        )}
      </GlassPanel>

      <p className="font-sans text-[0.76rem] text-slate-500">{t('company.usedFor')}</p>
    </div>
  );
};
