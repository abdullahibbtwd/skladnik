import React, { useState } from 'react';
import { Plus, Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UNITS_OF_MEASURE, type UnitOfMeasure } from '@skladnik/shared';
import { useAuthRole } from '../../lib/auth-store';
import {
  useCreateUnitAlias,
  useDeleteUnitAlias,
  useUnitAliasesQuery,
  useUpdateUnitAlias,
} from '../../lib/workspace-session';
import type { UnitAliasRecord } from '../../lib/workspace-api';
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

export const UnitsSettings: React.FC = () => {
  const { t } = useTranslation();
  const role = useAuthRole();
  const canWrite = role === 'OWNER';
  const aliasesQuery = useUnitAliasesQuery();
  const createAlias = useCreateUnitAlias();
  const updateAlias = useUpdateUnitAlias();
  const deleteAlias = useDeleteUnitAlias();
  const [modal, setModal] = useState<'create' | UnitAliasRecord | null>(null);
  const [raw, setRaw] = useState('');
  const [unit, setUnit] = useState<UnitOfMeasure>('PCS');
  const [error, setError] = useState<string | null>(null);

  const aliases = aliasesQuery.data?.aliases ?? [];
  const editing = typeof modal === 'object' && modal !== null ? modal : null;

  const openCreate = () => {
    setRaw('');
    setUnit('PCS');
    setError(null);
    setModal('create');
  };

  const openEdit = (alias: UnitAliasRecord) => {
    setRaw(alias.raw);
    setUnit(alias.unit);
    setError(null);
    setModal(alias);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateAlias.mutateAsync({ id: editing.id, raw: raw.trim(), unit });
        toast.success(t('units.updated'));
      } else {
        await createAlias.mutateAsync({ raw: raw.trim(), unit });
        toast.success(t('units.added'));
      }
      setModal(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('units.saveFailed'));
    }
  };

  const saving = createAlias.isPending || updateAlias.isPending;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('pages.unitsEyebrow')}
        title={t('pages.unitsTitle')}
        description={t('pages.unitsDesc')}
        action={canWrite ? <ActionButton icon={Plus} label={t('units.add')} onClick={openCreate} primary /> : undefined}
      />

      <GlassPanel
        title={t('units.aliases')}
        action={<LiveBadge>{aliases.length} {aliases.length === 1 ? t('units.aliasOne') : t('units.aliasMany')}</LiveBadge>}
        padded={false}
      >
        {aliasesQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('units.loading')}</p>
        ) : aliases.length === 0 ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('units.empty')}</p>
        ) : (
          <>
            <ul className={mobileCardListClass()}>
              {aliases.map((alias) => {
                const remove = async () => {
                  const ok = await confirm({
                    title: t('units.removeNamed', { raw: alias.raw }),
                    description: t('units.deleteBody'),
                    confirmLabel: t('common.remove'),
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    await deleteAlias.mutateAsync(alias.id);
                    toast.success(t('units.removed'));
                  } catch (deleteError) {
                    toast.error(deleteError instanceof Error ? deleteError.message : t('common.couldNotRemove'));
                  }
                };
                return (
                  <li key={alias.id} className={mobileCardClass()}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[0.86rem] text-ops-ink">{alias.raw}</p>
                        <p className="font-sans text-[0.74rem] text-slate-500">{t(`labels.unit.${alias.unit}`)}</p>
                      </div>
                      {canWrite && (
                        <RowActionsMenu
                          actions={[
                            { label: t('common.edit'), onClick: () => openEdit(alias) },
                            { label: t('common.remove'), onClick: () => void remove(), danger: true },
                          ]}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={desktopTableWrapClass()}>
              <table className="w-full min-w-[28rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-5 py-3 font-display font-medium">{t('units.printedAs')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('units.canonical')}</th>
                    {canWrite && <th className="px-5 py-3 text-right font-display font-medium">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {aliases.map((alias) => (
                    <tr key={alias.id} className={tableRowClass()}>
                      <td className="px-5 py-3.5 font-mono text-[0.86rem] text-ops-ink">{alias.raw}</td>
                      <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{t(`labels.unit.${alias.unit}`)}</td>
                      {canWrite && (
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <GhostButton onClick={() => openEdit(alias)}>{t('common.edit')}</GhostButton>
                            <GhostButton
                              danger
                              onClick={async () => {
                                const ok = await confirm({
                                  title: t('units.removeNamed', { raw: alias.raw }),
                                  description: t('units.deleteBody'),
                                  confirmLabel: t('common.remove'),
                                  danger: true,
                                });
                                if (!ok) return;
                                try {
                                  await deleteAlias.mutateAsync(alias.id);
                                  toast.success(t('units.removed'));
                                } catch (deleteError) {
                                  toast.error(deleteError instanceof Error ? deleteError.message : t('common.couldNotRemove'));
                                }
                              }}
                            >
                              {t('common.remove')}
                            </GhostButton>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassPanel>

      {!canWrite && (
        <p className="flex items-center gap-2 font-sans text-[0.78rem] text-slate-400">
          <Ruler size={14} />
          {t('units.ownerOnly')}
        </p>
      )}

      <WorkspaceModal title={editing ? t('units.edit') : t('units.add')} isOpen={modal !== null} onClose={() => setModal(null)}>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <FieldLabel htmlFor="alias-raw">{t('units.printedAbbr')}</FieldLabel>
            <input
              id="alias-raw"
              required
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              className={`${textFieldClass} pl-3`}
              placeholder={t('units.placeholderRaw')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="alias-unit">{t('units.mapsTo')}</FieldLabel>
            <Select
              id="alias-unit"
              value={unit}
              onChange={setUnit}
              options={UNITS_OF_MEASURE.map((item) => ({ value: item, label: t(`labels.unit.${item}`) }))}
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
              {saving ? t('common.saving') : editing ? t('common.saveChanges') : t('units.add')}
            </button>
          </div>
        </form>
      </WorkspaceModal>
    </div>
  );
};
