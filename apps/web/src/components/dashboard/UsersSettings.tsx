import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isCompanyWideRole, USER_ROLES, type UserRole } from '@skladnik/shared';
import { useAuthRole, useRequiredUser } from '../../lib/auth-store';
import {
  useCreateInvite,
  useDeactivateUser,
  useInvitesQuery,
  useResendInvite,
  useRevokeInvite,
  useSitesQuery,
  useUpdateUser,
  useUsersQuery,
} from '../../lib/workspace-session';
import type { InviteRecord, UserRecord } from '../../lib/workspace-api';
import { FieldError, FieldLabel, textFieldClass } from '../PasswordField';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { alert, confirm } from '../ui/Dialog';
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
import { Plus, UserPlus } from 'lucide-react';

export const UsersSettings: React.FC = () => {
  const { t } = useTranslation();
  const actor = useRequiredUser();
  const role = useAuthRole();
  const isOwner = role === 'OWNER';

  const usersQuery = useUsersQuery(isOwner);
  const sitesQuery = useSitesQuery();
  const invitesQuery = useInvitesQuery(isOwner);
  const updateUser = useUpdateUser();
  const deactivateUser = useDeactivateUser();
  const createInvite = useCreateInvite();
  const resendInvite = useResendInvite();
  const revokeInvite = useRevokeInvite();

  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editRole, setEditRole] = useState<UserRole>('STAFF');
  const [editSiteIds, setEditSiteIds] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('SITE_MANAGER');
  const [inviteSiteIds, setInviteSiteIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const users = usersQuery.data?.users ?? [];
  const activeSites = (sitesQuery.data?.sites ?? []).filter((site) => site.isActive);
  const pendingInvites = (invitesQuery.data?.invites ?? []).filter((invite) => invite.status === 'PENDING');

  const flash = (message: string, kind: 'success' | 'error' = 'success') => {
    if (kind === 'error') toast.error(message);
    else toast.success(message);
  };

  const openEdit = (user: UserRecord) => {
    setEditing(user);
    setEditRole(user.role);
    setEditSiteIds(user.sites.map((site) => site.id));
    setError(null);
  };

  const toggleSite = (list: string[], id: string, setter: (next: string[]) => void) => {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  const handleSaveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await updateUser.mutateAsync({
        id: editing.id,
        role: editRole,
        siteIds: isCompanyWideRole(editRole) ? [] : editSiteIds,
      });
      flash(t('users.updated'));
      setEditing(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('users.saveFailed'));
    }
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviteError(null);
    try {
      const result = await createInvite.mutateAsync({
        email: inviteEmail.trim(),
        role: inviteRole,
        siteIds: isCompanyWideRole(inviteRole) ? undefined : inviteSiteIds,
      });
      setInviteOpen(false);
      setInviteEmail('');
      setInviteSiteIds([]);
      setCopiedUrl(result.inviteUrl);
      if (result.delivered) {
        flash(t('users.inviteEmailed'));
      } else {
        await alert({
          title: t('users.inviteCreated'),
          description: t('users.inviteEmailHint'),
        });
        flash(t('users.inviteCreatedCopy'));
      }
    } catch (submitError) {
      setInviteError(submitError instanceof Error ? submitError.message : t('users.inviteFailed'));
    }
  };

  const sitePicker = (
    selected: string[],
    onToggle: (id: string) => void,
    disabled: boolean,
  ) => (
    <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-ops-canvas p-3">
      {activeSites.length === 0 ? (
        <p className="font-sans text-[0.78rem] text-slate-500">{t('users.addSiteFirst')}</p>
      ) : (
        activeSites.map((site) => (
          <label key={site.id} className="flex items-center gap-2 font-display text-[0.82rem] text-ops-ink">
            <input
              type="checkbox"
              checked={selected.includes(site.id)}
              disabled={disabled}
              onChange={() => onToggle(site.id)}
            />
            {site.name}
          </label>
        ))
      )}
    </div>
  );

  const needsSites = useMemo(() => !isCompanyWideRole(editRole), [editRole]);
  const inviteNeedsSites = useMemo(() => !isCompanyWideRole(inviteRole), [inviteRole]);

  if (!isOwner) {
    return <Navigate to="/app/settings" replace />;
  }

  return (
    <div className="flex flex-col gap-5">
      {copiedUrl && (
        <div className="rounded-xl border border-ops-teal/20 bg-teal-50 px-4 py-3 font-sans text-[0.8rem] text-ops-ink">
          {t('users.inviteLink')}{' '}
          <button
            type="button"
            className="font-display text-ops-teal hover:underline"
            onClick={() => {
              void navigator.clipboard.writeText(copiedUrl);
              toast.success(t('users.inviteCopied'));
            }}
          >
            {t('common.copy')}
          </button>
        </div>
      )}
      <PageHeader
        eyebrow={t('pages.usersEyebrow')}
        title={t('pages.usersTitle')}
        description={t('pages.usersDesc')}
        action={<ActionButton icon={UserPlus} label={t('users.invite')} onClick={() => { setInviteOpen(true); setInviteError(null); }} primary />}
      />

      <GlassPanel title={t('users.team')} action={<LiveBadge>{users.length}</LiveBadge>} padded={false}>
        {usersQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('users.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-5 py-3 font-display font-medium">{t('common.name')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('common.email')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('account.role')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('users.assignedSites')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('common.status')}</th>
                  <th className="px-5 py-3 text-right font-display font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={tableRowClass()}>
                    <td className="px-5 py-3.5 font-display text-[0.86rem] font-medium text-ops-ink">{user.name}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{user.email}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{t(`labels.role.${user.role}`)}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-500">
                      {user.allSites ? t('users.allSites') : user.sites.map((site) => site.name).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3.5 font-display text-[0.72rem]">
                      <span className={user.isActive ? 'text-ops-teal' : 'text-slate-400'}>{user.isActive ? t('common.active') : t('common.deactivated')}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <GhostButton onClick={() => openEdit(user)}>{t('common.edit')}</GhostButton>
                        {user.isActive && user.id !== actor.id && (
                          <GhostButton
                            danger
                            onClick={async () => {
                              const ok = await confirm({
                                title: t('users.deactivateNamed', { name: user.name }),
                                description: t('users.deactivateBody'),
                                confirmLabel: t('common.deactivate'),
                                danger: true,
                              });
                              if (!ok) return;
                              try {
                                await deactivateUser.mutateAsync(user.id);
                                flash(t('users.deactivated'));
                              } catch (deactivateError) {
                                flash(deactivateError instanceof Error ? deactivateError.message : t('common.couldNotDeactivate'), 'error');
                              }
                            }}
                          >
                            {t('common.deactivate')}
                          </GhostButton>
                        )}
                        {!user.isActive && (
                          <GhostButton
                            onClick={async () => {
                              try {
                                await updateUser.mutateAsync({ id: user.id, isActive: true });
                                flash(t('users.reactivated'));
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      <GlassPanel
        title={t('users.pendingInvites')}
        action={<LiveBadge>{pendingInvites.length}</LiveBadge>}
        padded={false}
      >
        {pendingInvites.length === 0 ? (
          <p className="px-5 py-6 font-sans text-sm text-slate-500">{t('users.noInvites')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead>
                <tr className={tableHeadRowClass()}>
                  <th className="px-5 py-3 font-display font-medium">{t('common.email')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('account.role')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('users.sites')}</th>
                  <th className="px-4 py-3 font-display font-medium">{t('users.expires')}</th>
                  <th className="px-5 py-3 text-right font-display font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((invite: InviteRecord) => (
                  <tr key={invite.id} className={tableRowClass()}>
                    <td className="px-5 py-3.5 font-sans text-[0.82rem] text-ops-ink">{invite.email}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem]">{t(`labels.role.${invite.role}`)}</td>
                    <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-500">
                      {isCompanyWideRole(invite.role) ? t('users.allSites') : invite.sites.map((site) => site.name).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3.5 font-sans text-[0.78rem] text-slate-500">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <GhostButton
                          onClick={async () => {
                            try {
                              const result = await resendInvite.mutateAsync(invite.id);
                              setCopiedUrl(result.inviteUrl);
                              flash(result.delivered ? t('users.inviteResent') : t('users.inviteRefreshed'));
                            } catch (resendError) {
                              flash(resendError instanceof Error ? resendError.message : t('users.resendFailed'), 'error');
                            }
                          }}
                        >
                          {t('common.resend')}
                        </GhostButton>
                        <GhostButton
                          danger
                          onClick={async () => {
                            const ok = await confirm({
                              title: t('users.revokeTitle'),
                              description: t('users.revokeBody', { email: invite.email }),
                              confirmLabel: t('users.revoke'),
                              danger: true,
                            });
                            if (!ok) return;
                            try {
                              await revokeInvite.mutateAsync(invite.id);
                              flash(t('users.revoked'));
                            } catch (revokeError) {
                              flash(revokeError instanceof Error ? revokeError.message : t('users.revokeFailed'), 'error');
                            }
                          }}
                        >
                          {t('users.revoke')}
                        </GhostButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      <WorkspaceModal title={t('users.editUser')} isOpen={editing !== null} onClose={() => setEditing(null)}>
        {editing && (
          <form className="flex flex-col gap-4" onSubmit={handleSaveUser}>
            <p className="font-sans text-sm text-slate-500">
              {editing.name} · {editing.email}
            </p>
            <div>
              <FieldLabel htmlFor="user-role">{t('account.role')}</FieldLabel>
              <Select
                id="user-role"
                value={editRole}
                disabled={editing.id === actor.id}
                onChange={setEditRole}
                options={USER_ROLES.map((item) => ({ value: item, label: t(`labels.role.${item}`) }))}
              />
            </div>
            {needsSites && (
              <div>
                <FieldLabel htmlFor="user-sites">{t('users.assignedSites')}</FieldLabel>
                {sitePicker(editSiteIds, (id) => toggleSite(editSiteIds, id, setEditSiteIds), false)}
              </div>
            )}
            {error && <FieldError>{error}</FieldError>}
            <div className="flex justify-end gap-2">
              <GhostButton onClick={() => setEditing(null)}>{t('common.cancel')}</GhostButton>
              <button
                type="submit"
                disabled={updateUser.isPending}
                className="rounded-xl bg-ops-teal px-4 py-2 font-display text-[0.82rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-60"
              >
                {updateUser.isPending ? t('common.saving') : t('common.saveChanges')}
              </button>
            </div>
          </form>
        )}
      </WorkspaceModal>

      <WorkspaceModal title={t('users.invite')} isOpen={inviteOpen} onClose={() => setInviteOpen(false)}>
        <form className="flex flex-col gap-4" onSubmit={handleInvite}>
          <div>
            <FieldLabel htmlFor="invite-email">{t('common.email')}</FieldLabel>
            <input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className={`${textFieldClass} pl-3`}
              placeholder={t('auth.emailPlaceholder')}
            />
          </div>
            <div>
              <FieldLabel htmlFor="invite-role">{t('account.role')}</FieldLabel>
              <Select
                id="invite-role"
                value={inviteRole}
                onChange={setInviteRole}
                options={USER_ROLES.map((item) => ({ value: item, label: t(`labels.role.${item}`) }))}
              />
            </div>
          {inviteNeedsSites && (
            <div>
              <FieldLabel htmlFor="invite-sites">{t('users.sites')}</FieldLabel>
              {sitePicker(inviteSiteIds, (id) => toggleSite(inviteSiteIds, id, setInviteSiteIds), false)}
            </div>
          )}
          {inviteError && <FieldError>{inviteError}</FieldError>}
          <div className="flex justify-end gap-2">
            <GhostButton onClick={() => setInviteOpen(false)}>{t('common.cancel')}</GhostButton>
            <button
              type="submit"
              disabled={createInvite.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-ops-teal px-4 py-2 font-display text-[0.82rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-60"
            >
              <Plus size={14} />
              {createInvite.isPending ? t('common.sending') : t('users.sendInvite')}
            </button>
          </div>
        </form>
      </WorkspaceModal>
    </div>
  );
};
