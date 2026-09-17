import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus } from 'lucide-react';
import { SITE_TYPES, type SiteType } from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import {
  useCreateSite,
  useDeactivateSite,
  useSitesQuery,
  useUpdateSite,
  useUsersQuery,
} from '../../lib/workspace-session';
import type { SiteRecord } from '../../lib/workspace-api';
import { FieldError, FieldLabel, textFieldClass } from '../PasswordField';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { confirm } from '../ui/Dialog';
import {
  ActionButton,
  GhostButton,
  GlassPanel,
  LiveBadge,
  PageHeader,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';
import { WorkspaceModal } from './WorkspaceModal';

type SiteFormState = {
  name: string;
  type: SiteType;
  address: string;
  managerUserId: string;
};

const emptyForm: SiteFormState = { name: '', type: 'STORE', address: '', managerUserId: '' };

export const SitesSettings: React.FC = () => {
  const { t } = useTranslation();
  const isOwner = useAuthRole() === 'OWNER';
  const sitesQuery = useSitesQuery();
  const usersQuery = useUsersQuery(isOwner);
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const deactivateSite = useDeactivateSite();
  const [modal, setModal] = useState<'create' | SiteRecord | null>(null);
  const [form, setForm] = useState<SiteFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const sites = sitesQuery.data?.sites ?? [];
  const people = (usersQuery.data?.users ?? []).filter((user) => user.isActive);

  const editing = typeof modal === 'object' && modal !== null ? modal : null;

  const openCreate = () => {
    setForm(emptyForm);
    setError(null);
    setModal('create');
  };

  const openEdit = (site: SiteRecord) => {
    setForm({
      name: site.name,
      type: site.type,
      address: site.address ?? '',
      managerUserId: site.manager?.id ?? '',
    });
    setError(null);
    setModal(site);
  };

  const flash = (message: string, kind: 'success' | 'error' = 'success') => {
    if (kind === 'error') toast.error(message);
    else toast.success(message);
  };

  const saving = createSite.isPending || updateSite.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      address: form.address.trim() || undefined,
      managerUserId: form.managerUserId || undefined,
    };
    try {
      if (editing) {
        await updateSite.mutateAsync({
          id: editing.id,
          ...payload,
          managerUserId: form.managerUserId ? form.managerUserId : null,
        });
        flash(t('sites.updated'));
      } else {
        await createSite.mutateAsync(payload);
        flash(t('sites.added'));
      }
      setModal(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('sites.saveFailed'));
    }
  };

  const title = useMemo(() => (editing ? t('sites.edit') : t('sites.add')), [editing, t]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('pages.sitesEyebrow')}
        title={t('pages.sitesTitle')}
        description={t('pages.sitesDesc')}
        action={isOwner ? <ActionButton icon={Plus} label={t('sites.add')} onClick={openCreate} primary /> : undefined}
      />

      <GlassPanel
        title={t('sites.locations')}
        action={<LiveBadge>{sites.length} {sites.length === 1 ? t('sites.siteOne') : t('sites.siteMany')}</LiveBadge>}
        padded={false}
      >
        {sitesQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('sites.loading')}</p>
        ) : sites.length === 0 ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('sites.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-5 py-3 font-display font-medium">{t('common.name')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('common.type')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('common.address')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('sites.personInCharge')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('common.status')}</th>
                  {isOwner && <th className="px-5 py-3 text-right font-display font-medium">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id} className={tableRowClass()}>
                    <td className="px-5 py-3.5 font-display text-[0.86rem] font-medium text-ops-ink">{site.name}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{t(`labels.siteType.${site.type}`)}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-500">{site.address || '—'}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{site.manager?.name ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={site.isActive ? 'font-display text-[0.72rem] text-ops-teal' : 'font-display text-[0.72rem] text-slate-400'}>
                        {site.isActive ? t('common.active') : t('common.deactivated')}
                      </span>
                    </td>
                    {isOwner && (
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <GhostButton onClick={() => openEdit(site)}>{t('common.edit')}</GhostButton>
                          {site.isActive ? (
                            <GhostButton
                              danger
                              onClick={async () => {
                                const ok = await confirm({
                                  title: t('sites.deactivateNamed', { name: site.name }),
                                  description: t('sites.deactivateBody'),
                                  confirmLabel: t('common.deactivate'),
                                  danger: true,
                                });
                                if (!ok) return;
                                try {
                                  await deactivateSite.mutateAsync(site.id);
                                  flash(t('sites.deactivated'));
                                } catch (deactivateError) {
                                  flash(deactivateError instanceof Error ? deactivateError.message : t('common.couldNotDeactivate'), 'error');
                                }
                              }}
                            >
                              {t('common.deactivate')}
                            </GhostButton>
                          ) : (
                            <GhostButton
                              onClick={async () => {
                                try {
                                  await updateSite.mutateAsync({ id: site.id, isActive: true });
                                  flash(t('sites.reactivated'));
                                } catch (reactivateError) {
                                  flash(reactivateError instanceof Error ? reactivateError.message : t('common.couldNotReactivate'), 'error');
                                }
                              }}
                            >
                              {t('common.reactivate')}
                            </GhostButton>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      {!isOwner && (
        <p className="flex items-center gap-2 font-sans text-[0.78rem] text-slate-400">
          <MapPin size={14} />
          {t('sites.ownerOnly')}
        </p>
      )}

      <WorkspaceModal title={title} isOpen={modal !== null} onClose={() => setModal(null)}>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <FieldLabel htmlFor="site-name">{t('common.name')}</FieldLabel>
            <input
              id="site-name"
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className={`${textFieldClass} pl-3`}
              placeholder={t('sites.placeholderName')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="site-type">{t('common.type')}</FieldLabel>
            <Select
              id="site-type"
              value={form.type}
              onChange={(type) => setForm((prev) => ({ ...prev, type }))}
              options={SITE_TYPES.map((type) => ({ value: type, label: t(`labels.siteType.${type}`) }))}
            />
          </div>
          <div>
            <FieldLabel htmlFor="site-address">{t('common.address')}</FieldLabel>
            <input
              id="site-address"
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              className={`${textFieldClass} pl-3`}
              placeholder={t('sites.placeholderAddress')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="site-manager">{t('sites.personInCharge')}</FieldLabel>
            <Select
              id="site-manager"
              value={form.managerUserId}
              onChange={(managerUserId) => setForm((prev) => ({ ...prev, managerUserId }))}
              placeholder={t('sites.notAssigned')}
              options={[
                { value: '', label: t('sites.notAssigned') },
                ...people.map((user) => ({
                  value: user.id,
                  label: user.name,
                  hint: user.email,
                })),
              ]}
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => setModal(null)}>{t('common.cancel')}</GhostButton>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-ops-teal px-4 py-2 font-display text-[0.82rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-60"
            >
              {saving ? t('common.saving') : editing ? t('common.saveChanges') : t('sites.add')}
            </button>
          </div>
        </form>
      </WorkspaceModal>
    </div>
  );
};
