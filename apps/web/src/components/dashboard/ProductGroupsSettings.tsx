import React, { useMemo, useState } from 'react';
import { FolderTree, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthRole } from '../../lib/auth-store';
import {
  useCreateProductGroup,
  useDeleteProductGroup,
  useProductGroupsQuery,
  useUpdateProductGroup,
} from '../../lib/workspace-session';
import { flattenProductGroups, type ProductGroupNode } from '../../lib/workspace-api';
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

type GroupForm = { name: string; parentId: string };

const emptyForm: GroupForm = { name: '', parentId: '' };

function collectIds(node: ProductGroupNode): string[] {
  return [node.id, ...node.children.flatMap(collectIds)];
}

function GroupRows({
  nodes,
  depth,
  canWrite,
  onEdit,
  onAddChild,
  onDelete,
}: {
  nodes: ProductGroupNode[];
  depth: number;
  canWrite: boolean;
  onEdit: (node: ProductGroupNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (node: ProductGroupNode) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {nodes.map((node) => (
        <React.Fragment key={node.id}>
          <tr className={tableRowClass()}>
            <td className="px-5 py-3.5">
              <p
                className="font-display text-[0.86rem] font-medium text-ops-ink"
                style={{ paddingLeft: depth * 18 }}
              >
                {node.name}
              </p>
            </td>
            <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-500">{node.productCount}</td>
            {canWrite && (
              <td className="px-5 py-3.5 text-right">
                <div className="flex justify-end gap-1.5">
                  <GhostButton onClick={() => onAddChild(node.id)}>{t('groups.addChild')}</GhostButton>
                  <GhostButton onClick={() => onEdit(node)}>{t('common.edit')}</GhostButton>
                  <GhostButton danger onClick={() => onDelete(node)}>
                    {t('common.delete')}
                  </GhostButton>
                </div>
              </td>
            )}
          </tr>
          <GroupRows
            nodes={node.children}
            depth={depth + 1}
            canWrite={canWrite}
            onEdit={onEdit}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
        </React.Fragment>
      ))}
    </>
  );
}

function GroupCards({
  nodes,
  depth,
  canWrite,
  onEdit,
  onAddChild,
  onDelete,
}: {
  nodes: ProductGroupNode[];
  depth: number;
  canWrite: boolean;
  onEdit: (node: ProductGroupNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (node: ProductGroupNode) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {nodes.map((node) => (
        <React.Fragment key={node.id}>
          <li className={mobileCardClass()} style={{ paddingLeft: 16 + depth * 14 }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-[0.86rem] font-medium text-ops-ink">{node.name}</p>
                <p className="font-sans text-[0.74rem] text-slate-500">
                  {t('groups.products')}: {node.productCount}
                </p>
              </div>
              {canWrite && (
                <RowActionsMenu
                  actions={[
                    { label: t('groups.addChild'), onClick: () => onAddChild(node.id) },
                    { label: t('common.edit'), onClick: () => onEdit(node) },
                    { label: t('common.delete'), onClick: () => onDelete(node), danger: true },
                  ]}
                />
              )}
            </div>
          </li>
          <GroupCards
            nodes={node.children}
            depth={depth + 1}
            canWrite={canWrite}
            onEdit={onEdit}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
        </React.Fragment>
      ))}
    </>
  );
}

export const ProductGroupsSettings: React.FC = () => {
  const { t } = useTranslation();
  const role = useAuthRole();
  const canWrite = role === 'OWNER' || role === 'ACCOUNTANT';
  const groupsQuery = useProductGroupsQuery();
  const createGroup = useCreateProductGroup();
  const updateGroup = useUpdateProductGroup();
  const deleteGroup = useDeleteProductGroup();
  const [modal, setModal] = useState<'create' | ProductGroupNode | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const groups = groupsQuery.data?.groups ?? [];
  const editing = typeof modal === 'object' && modal !== null ? modal : null;
  const blockedIds = editing ? new Set(collectIds(editing)) : new Set<string>();
  const parentOptions = flattenProductGroups(groups).filter((group) => !blockedIds.has(group.id));

  const openCreate = (parentId = '') => {
    setForm({ name: '', parentId });
    setError(null);
    setModal('create');
  };

  const openEdit = (node: ProductGroupNode) => {
    setForm({ name: node.name, parentId: node.parentId ?? '' });
    setError(null);
    setModal(node);
  };

  const handleDelete = async (node: ProductGroupNode) => {
    const ok = await confirm({
      title: t('groups.deleteNamed', { name: node.name }),
      description: t('groups.deleteBody'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGroup.mutateAsync(node.id);
      toast.success(t('groups.deleted'));
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : t('common.couldNotDelete'));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateGroup.mutateAsync({
          id: editing.id,
          name: form.name.trim(),
          parentId: form.parentId ? form.parentId : null,
        });
        toast.success(t('groups.updated'));
      } else {
        await createGroup.mutateAsync({
          name: form.name.trim(),
          parentId: form.parentId || undefined,
        });
        toast.success(t('groups.added'));
      }
      setModal(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('groups.saveFailed'));
    }
  };

  const title = useMemo(() => (editing ? t('groups.edit') : t('groups.add')), [editing, t]);
  const count = flattenProductGroups(groups).length;
  const saving = createGroup.isPending || updateGroup.isPending;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('pages.groupsEyebrow')}
        title={t('pages.groupsTitle')}
        description={t('pages.groupsDesc')}
        action={canWrite ? <ActionButton icon={Plus} label={t('groups.add')} onClick={() => openCreate()} primary /> : undefined}
      />

      <GlassPanel title={t('groups.groups')} action={<LiveBadge>{count} {count === 1 ? t('groups.groupOne') : t('groups.groupMany')}</LiveBadge>} padded={false}>
        {groupsQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('groups.loading')}</p>
        ) : groups.length === 0 ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('groups.empty')}</p>
        ) : (
          <>
            <ul className={mobileCardListClass()}>
              <GroupCards
                nodes={groups}
                depth={0}
                canWrite={canWrite}
                onEdit={openEdit}
                onAddChild={(parentId) => openCreate(parentId)}
                onDelete={(node) => void handleDelete(node)}
              />
            </ul>
            <div className={desktopTableWrapClass()}>
              <table className="w-full min-w-[32rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-5 py-3 font-display font-medium">{t('common.name')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('groups.products')}</th>
                    {canWrite && <th className="px-5 py-3 text-right font-display font-medium">{t('common.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  <GroupRows
                    nodes={groups}
                    depth={0}
                    canWrite={canWrite}
                    onEdit={openEdit}
                    onAddChild={(parentId) => openCreate(parentId)}
                    onDelete={(node) => void handleDelete(node)}
                  />
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassPanel>

      {!canWrite && (
        <p className="flex items-center gap-2 font-sans text-[0.78rem] text-slate-400">
          <FolderTree size={14} />
          {t('groups.ownerOnly')}
        </p>
      )}

      <WorkspaceModal title={title} isOpen={modal !== null} onClose={() => setModal(null)}>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div>
            <FieldLabel htmlFor="group-name">{t('common.name')}</FieldLabel>
            <input
              id="group-name"
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className={`${textFieldClass} pl-3`}
              placeholder={t('groups.placeholder')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="group-parent">{t('groups.parent')}</FieldLabel>
            <Select
              id="group-parent"
              value={form.parentId}
              onChange={(parentId) => setForm((prev) => ({ ...prev, parentId }))}
              placeholder={t('groups.topLevel')}
              options={[
                { value: '', label: t('groups.topLevel') },
                ...parentOptions.map((group) => ({ value: group.id, label: group.label })),
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
              {saving ? t('common.saving') : editing ? t('common.saveChanges') : t('groups.add')}
            </button>
          </div>
        </form>
      </WorkspaceModal>
    </div>
  );
};
