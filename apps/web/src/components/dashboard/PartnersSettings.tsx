import React, { useMemo, useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PARTNER_KINDS, type PartnerKind } from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import {
  useCreatePartner,
  useDeletePartner,
  usePartnersQuery,
  useUpdatePartner,
} from '../../lib/workspace-session';
import type { PartnerRecord } from '../../lib/workspace-api';
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

type PartnerForm = {
  name: string;
  kind: PartnerKind;
  taxId: string;
  address: string;
  mol: string;
  phone: string;
  email: string;
  bankAccount: string;
};

const emptyForm: PartnerForm = {
  name: '',
  kind: 'SUPPLIER',
  taxId: '',
  address: '',
  mol: '',
  phone: '',
  email: '',
  bankAccount: '',
};

export const PartnersSettings: React.FC = () => {
  const { t } = useTranslation();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'ACCOUNTANT';
  const partnersQuery = usePartnersQuery();
  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();
  const deletePartner = useDeletePartner();
  const [modal, setModal] = useState<'create' | PartnerRecord | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const partners = partnersQuery.data?.partners ?? [];
  const editing = typeof modal === 'object' && modal !== null ? modal : null;

  const openCreate = () => {
    setForm(emptyForm);
    setError(null);
    setModal('create');
  };

  const openEdit = (partner: PartnerRecord) => {
    setForm({
      name: partner.name,
      kind: partner.kind,
      taxId: partner.taxId ?? '',
      address: partner.address ?? '',
      mol: partner.mol ?? '',
      phone: partner.phone ?? '',
      email: partner.email ?? '',
      bankAccount: partner.bankAccount ?? '',
    });
    setError(null);
    setModal(partner);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      taxId: form.taxId.trim() || undefined,
      address: form.address.trim() || undefined,
      mol: form.mol.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      bankAccount: form.bankAccount.trim() || undefined,
    };
    try {
      if (editing) {
        await updatePartner.mutateAsync({
          id: editing.id,
          ...payload,
          taxId: form.taxId.trim() ? form.taxId.trim() : null,
          address: form.address.trim() ? form.address.trim() : null,
          mol: form.mol.trim() ? form.mol.trim() : null,
          phone: form.phone.trim() ? form.phone.trim() : null,
          email: form.email.trim() ? form.email.trim() : null,
          bankAccount: form.bankAccount.trim() ? form.bankAccount.trim() : null,
        });
        toast.success(t('partners.updated'));
      } else {
        await createPartner.mutateAsync(payload);
        toast.success(t('partners.added'));
      }
      setModal(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('partners.saveFailed'));
    }
  };

  const title = useMemo(() => (editing ? t('partners.edit') : t('partners.add')), [editing, t]);
  const saving = createPartner.isPending || updatePartner.isPending;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('pages.partnersEyebrow')}
        title={t('pages.partnersTitle')}
        description={t('pages.partnersDesc')}
        action={canWrite ? <ActionButton icon={Plus} label={t('partners.add')} onClick={openCreate} primary /> : undefined}
      />

      <GlassPanel
        title={t('partners.directory')}
        action={<LiveBadge>{partners.length} {partners.length === 1 ? t('partners.partnerOne') : t('partners.partnerMany')}</LiveBadge>}
        padded={false}
      >
        {partnersQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('partners.loading')}</p>
        ) : partners.length === 0 ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('partners.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-5 py-3 font-display font-medium">{t('common.name')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('common.type')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('partners.vatId')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('common.phone')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('partners.mol')}</th>
                  {canWrite && <th className="px-5 py-3 text-right font-display font-medium">{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => (
                  <tr key={partner.id} className={tableRowClass()}>
                    <td className="px-5 py-3.5">
                      <p className="font-display text-[0.86rem] font-medium text-ops-ink">{partner.name}</p>
                      <p className="font-sans text-[0.72rem] text-slate-400">{partner.email || partner.address || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{t(`labels.partnerKind.${partner.kind}`)}</td>
                    <td className="px-4 py-3.5 font-mono text-[0.78rem] text-slate-600">{partner.taxId || '—'}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{partner.phone || '—'}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{partner.mol || '—'}</td>
                    {canWrite && (
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <GhostButton onClick={() => openEdit(partner)}>{t('common.edit')}</GhostButton>
                          <GhostButton
                            danger
                            onClick={async () => {
                              const ok = await confirm({
                                title: t('partners.deleteNamed', { name: partner.name }),
                                description: t('partners.deleteBody'),
                                confirmLabel: t('common.delete'),
                                danger: true,
                              });
                              if (!ok) return;
                              try {
                                await deletePartner.mutateAsync(partner.id);
                                toast.success(t('partners.deleted'));
                              } catch (deleteError) {
                                toast.error(deleteError instanceof Error ? deleteError.message : t('common.couldNotDelete'));
                              }
                            }}
                          >
                            {t('common.delete')}
                          </GhostButton>
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

      {!canWrite && (
        <p className="flex items-center gap-2 font-sans text-[0.78rem] text-slate-400">
          <Truck size={14} />
          {t('partners.ownerOnly')}
        </p>
      )}

      <WorkspaceModal title={title} isOpen={modal !== null} onClose={() => setModal(null)} wide>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="partner-name">{t('common.name')}</FieldLabel>
              <input
                id="partner-name"
                required
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className={`${textFieldClass} pl-3`}
                placeholder={t('partners.placeholderName')}
              />
            </div>
            <div>
              <FieldLabel htmlFor="partner-kind">{t('common.type')}</FieldLabel>
              <Select
                id="partner-kind"
                value={form.kind}
                onChange={(kind) => setForm((prev) => ({ ...prev, kind }))}
                options={PARTNER_KINDS.map((kind) => ({ value: kind, label: t(`labels.partnerKind.${kind}`) }))}
              />
            </div>
            <div>
              <FieldLabel htmlFor="partner-tax">{t('partners.vatId')}</FieldLabel>
              <input
                id="partner-tax"
                value={form.taxId}
                onChange={(event) => setForm((prev) => ({ ...prev, taxId: event.target.value }))}
                className={`${textFieldClass} pl-3`}
                placeholder={t('partners.placeholderVat')}
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="partner-address">{t('common.address')}</FieldLabel>
              <input
                id="partner-address"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="partner-mol">{t('partners.mol')}</FieldLabel>
              <input
                id="partner-mol"
                value={form.mol}
                onChange={(event) => setForm((prev) => ({ ...prev, mol: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="partner-phone">{t('common.phone')}</FieldLabel>
              <input
                id="partner-phone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="partner-email">{t('common.email')}</FieldLabel>
              <input
                id="partner-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="partner-bank">{t('partners.bank')}</FieldLabel>
              <input
                id="partner-bank"
                value={form.bankAccount}
                onChange={(event) => setForm((prev) => ({ ...prev, bankAccount: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => setModal(null)}>{t('common.cancel')}</GhostButton>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-ops-teal px-4 py-2 font-display text-[0.82rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-60"
            >
              {saving ? t('common.saving') : editing ? t('common.saveChanges') : t('partners.add')}
            </button>
          </div>
        </form>
      </WorkspaceModal>
    </div>
  );
};
