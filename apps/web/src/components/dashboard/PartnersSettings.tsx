import React, { useMemo, useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PARTNER_KINDS, taxIdProblems, type PartnerKind } from '@skladnik/shared';
import { cn } from '../../lib/cn';
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
  desktopTableWrapClass,
  GhostButton,
  GlassPanel,
  LiveBadge,
  mobileCardClass,
  mobileCardListClass,
  PageHeader,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';
import { RowActionsMenu } from './RowActionsMenu';
import { WorkspaceModal } from './WorkspaceModal';
import { TaxIdFields, typedTaxIdProblems, useTaxIdProblemText } from './TaxIdFields';

type PartnerForm = {
  name: string;
  kind: PartnerKind;
  eik: string;
  vatNumber: string;
  address: string;
  mol: string;
  phone: string;
  email: string;
  bankAccount: string;
};

const emptyForm: PartnerForm = {
  name: '',
  kind: 'SUPPLIER',
  eik: '',
  vatNumber: '',
  address: '',
  mol: '',
  phone: '',
  email: '',
  bankAccount: '',
};

export const PartnersSettings: React.FC = () => {
  const { t } = useTranslation();
  const role = useAuthRole();
  const canWrite = role === 'OWNER';
  const partnersQuery = usePartnersQuery();
  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();
  const deletePartner = useDeletePartner();
  const [modal, setModal] = useState<'create' | PartnerRecord | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const problemText = useTaxIdProblemText();

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
      eik: partner.eik ?? '',
      vatNumber: partner.vatNumber ?? '',
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
    if (typedTaxIdProblems(form.eik, form.vatNumber).length) return;
    setError(null);
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      eik: form.eik.trim() || undefined,
      vatNumber: form.vatNumber.trim() || undefined,
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
          eik: form.eik.trim() ? form.eik.trim() : null,
          vatNumber: form.vatNumber.trim() ? form.vatNumber.trim() : null,
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
  const idProblems = typedTaxIdProblems(form.eik, form.vatNumber);

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
          <>
            <ul className={mobileCardListClass()}>
              {partners.map((partner) => {
                const problems = taxIdProblems({ eik: partner.eik, vatNumber: partner.vatNumber });
                const badEik = problems.find((problem) => problem.field === 'eik');
                const badVat = problems.find((problem) => problem.field === 'vatNumber');
                const removePartner = async () => {
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
                };
                return (
                  <li key={partner.id} className={mobileCardClass()}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-[0.86rem] font-medium text-ops-ink">{partner.name}</p>
                        <p className="font-sans text-[0.74rem] text-slate-500">
                          {t(`labels.partnerKind.${partner.kind}`)}
                          {partner.address ? ` · ${partner.address}` : ''}
                        </p>
                        <p className={cn('mt-1 font-mono text-[0.72rem]', badEik || badVat ? 'text-ops-danger' : 'text-slate-500')}>
                          {[partner.eik, partner.vatNumber].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {(partner.mol || partner.phone || partner.email) && (
                          <p className="mt-0.5 font-sans text-[0.72rem] text-slate-400">
                            {[partner.mol, partner.phone, partner.email].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      {canWrite && (
                        <RowActionsMenu
                          actions={[
                            { label: t('common.edit'), onClick: () => openEdit(partner) },
                            { label: t('common.delete'), onClick: () => void removePartner(), danger: true },
                          ]}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={desktopTableWrapClass()}>
              <table className="w-full min-w-[56rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-5 py-3 font-display font-medium">{t('common.name')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('common.type')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('taxId.eik')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('taxId.vatNumber')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('partners.contact')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('partners.bank')}</th>
                    {canWrite && <th className="px-5 py-3 text-right font-display font-medium">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => {
                    const problems = taxIdProblems({ eik: partner.eik, vatNumber: partner.vatNumber });
                    const badEik = problems.find((problem) => problem.field === 'eik');
                    const badVat = problems.find((problem) => problem.field === 'vatNumber');
                    return (
                      <tr key={partner.id} className={tableRowClass()}>
                        <td className="px-5 py-3.5">
                          <p className="font-display text-[0.86rem] font-medium text-ops-ink">{partner.name}</p>
                          <p className="font-sans text-[0.72rem] text-slate-400">{partner.address || '—'}</p>
                        </td>
                        <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{t(`labels.partnerKind.${partner.kind}`)}</td>
                        <td className={cn('px-4 py-3.5 font-mono text-[0.78rem]', badEik ? 'text-ops-danger' : 'text-slate-600')} title={badEik ? problemText(badEik) : undefined}>
                          {partner.eik || '—'}
                        </td>
                        <td className={cn('px-4 py-3.5 font-mono text-[0.78rem]', badVat ? 'text-ops-danger' : 'text-slate-600')} title={badVat ? problemText(badVat) : undefined}>
                          {partner.vatNumber || '—'}
                        </td>
                        <td className="px-4 py-3.5 font-sans text-[0.78rem] text-slate-600">
                          <p>{partner.mol || '—'}</p>
                          <p className="text-slate-400">{[partner.phone, partner.email].filter(Boolean).join(' · ')}</p>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[0.74rem] text-slate-600">{partner.bankAccount || '—'}</td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
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
            <div className="hidden sm:block" />
            <TaxIdFields
              idPrefix="partner"
              eik={form.eik}
              vatNumber={form.vatNumber}
              onChange={(ids) => setForm((prev) => ({ ...prev, ...ids }))}
            />
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
              disabled={saving || idProblems.length > 0}
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
