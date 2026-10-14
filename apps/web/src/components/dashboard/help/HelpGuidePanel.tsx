import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  Search,
  ShieldAlert,
  Smartphone,
  UserRound,
} from 'lucide-react';
import type { UserRole } from '@skladnik/shared';
import { USER_ROLES } from '@skladnik/shared';
import { useAuthRole } from '../../../lib/auth-store';
import { cn } from '../../../lib/cn';
import { GlassPanel, PageHeader } from '../dashboard-ui';
import {
  guideForRole,
  HELP_ROLES,
  HELP_START_TOPICS,
  HELP_TROUBLE_TOPICS,
  type HelpSectionId,
} from './help-structure';

function isUserRole(value: string | null): value is UserRole {
  return Boolean(value && (USER_ROLES as readonly string[]).includes(value));
}

function TaskBlock({ taskId, splitNav }: { taskId: string; splitNav?: boolean }) {
  const { t, i18n } = useTranslation();
  const base = `help.tasks.${taskId}`;
  const steps = t(`${base}.steps`, { returnObjects: true });
  const needed = t(`${base}.needed`, { returnObjects: true });
  const notes = t(`${base}.notes`, { returnObjects: true });
  const stepList = Array.isArray(steps) ? (steps as string[]) : [];
  const neededList = Array.isArray(needed) ? (needed as string[]) : [];
  const noteList = Array.isArray(notes) ? (notes as string[]) : [];
  const hasDesktop = i18n.exists(`${base}.desktop`);
  const hasMobile = i18n.exists(`${base}.mobile`);

  return (
    <article id={`task-${taskId}`} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-ops-canvas/60 p-4 sm:p-5">
      <h3 className="font-display text-[1rem] font-semibold text-ops-ink">{t(`${base}.title`)}</h3>
      <p className="mt-1 font-sans text-[0.82rem] text-slate-500">
        <span className="font-medium text-slate-600">{t('help.labels.where')} </span>
        {t(`${base}.where`)}
      </p>

      {splitNav && hasDesktop && hasMobile ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="font-display text-[0.72rem] font-semibold tracking-wider text-ops-accent uppercase">
              {t('help.labels.desktop')}
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 font-sans text-[0.82rem] leading-relaxed text-ops-ink">
              {(t(`${base}.desktop`, { returnObjects: true }) as string[]).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <p className="font-display text-[0.72rem] font-semibold tracking-wider text-ops-teal uppercase">
              {t('help.labels.mobile')}
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 font-sans text-[0.82rem] leading-relaxed text-ops-ink">
              {(t(`${base}.mobile`, { returnObjects: true }) as string[]).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <ol className="mt-3 list-decimal space-y-1.5 pl-4 font-sans text-[0.84rem] leading-relaxed text-ops-ink">
          {stepList.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      {neededList.length > 0 && (
        <div className="mt-3">
          <p className="font-display text-[0.72rem] font-semibold tracking-wider text-slate-500 uppercase">
            {t('help.labels.needed')}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 font-sans text-[0.8rem] text-slate-600">
            {neededList.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 rounded-xl border border-ops-teal/20 bg-teal-50/80 px-3 py-2 font-sans text-[0.8rem] text-ops-teal">
        <span className="font-medium">{t('help.labels.next')} </span>
        {t(`${base}.next`)}
      </p>

      {noteList.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {noteList.map((note) => (
            <li
              key={note}
              className="flex gap-2 rounded-xl border border-ops-warn/20 bg-orange-50/70 px-3 py-2 font-sans text-[0.78rem] text-ops-warn"
            >
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export const HelpGuidePanel: React.FC = () => {
  const { t } = useTranslation();
  const myRole = useAuthRole();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');

  const sectionParam = params.get('section');
  const roleParam = params.get('role');
  const section: HelpSectionId =
    sectionParam === 'roles' || sectionParam === 'role' || sectionParam === 'troubleshoot' || sectionParam === 'start'
      ? sectionParam
      : 'start';
  const selectedRole: UserRole = isUserRole(roleParam) ? roleParam : myRole ?? 'OWNER';
  const viewingOwnRole = myRole === selectedRole;
  /** Owners may open full how-tos for every role (training / support). Others only get their own. */
  const canViewFullGuide = myRole === 'OWNER' || viewingOwnRole;
  const roleGuide = guideForRole(selectedRole);

  useEffect(() => {
    if (!params.get('section') && myRole) {
      setParams({ section: 'role', role: myRole }, { replace: true });
    }
  }, [myRole, params, setParams]);

  const go = (next: HelpSectionId, role?: UserRole) => {
    const nextParams: Record<string, string> = { section: next };
    if (next === 'role') nextParams.role = role ?? selectedRole;
    setParams(nextParams);
  };

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !myRole) return [];
    const guides = myRole === 'OWNER' ? HELP_ROLES : [guideForRole(myRole)];
    return guides.flatMap((guide) =>
      guide.tasks
        .filter((task) => {
          const title = t(task.titleKey).toLowerCase();
          const where = t(`help.tasks.${task.id}.where`).toLowerCase();
          return title.includes(q) || where.includes(q);
        })
        .map((task) => ({ ...task, role: guide.role })),
    );
  }, [myRole, query, t]);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow={t('help.eyebrow')}
        title={t('help.title')}
        description={t('help.description')}
      />

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('help.searchPlaceholder')}
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-4 pl-10 font-sans text-[0.88rem] text-ops-ink shadow-sm outline-none focus:border-ops-accent/40 focus:ring-2 focus:ring-ops-accent/15"
        />
      </div>

      {query.trim() && (
        <GlassPanel>
          <p className="font-display text-[0.78rem] font-medium text-slate-500">
            {t('help.searchResults', { count: searchHits.length })}
          </p>
          {searchHits.length === 0 ? (
            <p className="mt-2 font-sans text-[0.84rem] text-slate-500">{t('help.searchEmpty')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {searchHits.map((hit) => (
                <li key={`${hit.role}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      go('role', hit.role);
                      requestAnimationFrame(() => {
                        document.getElementById(`task-${hit.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      });
                    }}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left font-display text-[0.88rem] text-ops-ink hover:text-ops-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{t(hit.titleKey)}</span>
                      {myRole === 'OWNER' && hit.role !== myRole && (
                        <span className="font-sans text-[0.72rem] text-slate-400">{t(`labels.role.${hit.role}`)}</span>
                      )}
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
      )}

      <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {(
          [
            ['start', t('help.nav.start'), BookOpen],
            ['roles', t('help.nav.roles'), UserRound],
            ['role', t('help.nav.myRole'), CircleHelp],
            ['troubleshoot', t('help.nav.troubleshoot'), Smartphone],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id === 'role' ? 'role' : id, id === 'role' ? myRole ?? undefined : undefined)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-display text-[0.82rem] font-medium transition-all',
              section === id || (id === 'role' && section === 'role')
                ? 'bg-indigo-50 text-ops-accent'
                : 'text-slate-500 hover:bg-ops-canvas hover:text-ops-ink',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      {section === 'start' && (
        <div className="flex flex-col gap-4">
          {HELP_START_TOPICS.map((topic) => (
            <GlassPanel key={topic}>
              <h2 className="font-display text-[1.05rem] font-semibold text-ops-ink">{t(`help.start.${topic}.title`)}</h2>
              <div className="mt-2 space-y-2 font-sans text-[0.86rem] leading-relaxed text-slate-600">
                {(t(`help.start.${topic}.body`, { returnObjects: true }) as string[]).map((para) => (
                  <p key={para}>{para}</p>
                ))}
              </div>
              {topic === 'navigate' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-ops-canvas p-3.5">
                    <p className="font-display text-[0.72rem] font-semibold tracking-wider text-ops-accent uppercase">
                      {t('help.labels.desktop')}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 font-sans text-[0.82rem] text-ops-ink">
                      {(t('help.start.navigate.desktop', { returnObjects: true }) as string[]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-ops-canvas p-3.5">
                    <p className="font-display text-[0.72rem] font-semibold tracking-wider text-ops-teal uppercase">
                      {t('help.labels.mobile')}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 font-sans text-[0.82rem] text-ops-ink">
                      {(t('help.start.navigate.mobile', { returnObjects: true }) as string[]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </GlassPanel>
          ))}
          {myRole && (
            <button
              type="button"
              onClick={() => go('role', myRole)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-ops-teal px-4 py-3 font-display text-[0.88rem] font-medium text-white shadow-[0_6px_16px_rgba(13,148,136,0.28)]"
            >
              {t('help.openMyRole', { role: t(`labels.role.${myRole}`) })}
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}

      {section === 'roles' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {HELP_ROLES.map((guide) => {
            const mine = guide.role === myRole;
            return (
              <button
                key={guide.role}
                type="button"
                onClick={() => go('role', guide.role)}
                className={cn(
                  'rounded-2xl border p-4 text-left transition-all hover:border-ops-accent/40 hover:shadow-sm',
                  mine ? 'border-ops-accent/40 bg-indigo-50/70' : 'border-slate-200 bg-white',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-[1rem] font-semibold text-ops-ink">{t(`labels.role.${guide.role}`)}</p>
                  {mine && (
                    <span className="rounded-full bg-ops-accent/10 px-2 py-0.5 font-display text-[0.68rem] font-medium text-ops-accent">
                      {t('help.yourRole')}
                    </span>
                  )}
                </div>
                <p className="mt-2 font-sans text-[0.82rem] leading-relaxed text-slate-600">{t(guide.blurbKey)}</p>
                <p className="mt-3 inline-flex items-center gap-1 font-display text-[0.78rem] font-medium text-ops-accent">
                  {mine
                    ? t('help.viewMyGuide')
                    : myRole === 'OWNER'
                      ? t('help.viewFullGuide')
                      : t('help.viewRoleSummary')}
                  <ChevronRight size={14} />
                </p>
              </button>
            );
          })}
        </div>
      )}

      {section === 'role' && (
        <div className="flex flex-col gap-4">
          <GlassPanel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-[0.72rem] font-medium tracking-wider text-ops-accent uppercase">
                  {viewingOwnRole
                    ? t('help.yourRole')
                    : canViewFullGuide
                      ? t('help.ownerViewingRole')
                      : t('help.roleOverview')}
                </p>
                <h2 className="mt-1 font-display text-[1.2rem] font-semibold text-ops-ink">
                  {t(`labels.role.${selectedRole}`)}
                </h2>
                <p className="mt-2 max-w-2xl font-sans text-[0.86rem] leading-relaxed text-slate-600">
                  {t(roleGuide.blurbKey)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => go('roles')}
                className="font-display text-[0.8rem] font-medium text-ops-accent hover:underline"
              >
                {t('help.allRoles')}
              </button>
            </div>
            <p className="mt-4 rounded-xl border border-slate-200 bg-ops-canvas px-3.5 py-3 font-sans text-[0.82rem] text-slate-600">
              <span className="font-medium text-ops-ink">{t('help.labels.areas')} </span>
              {t(roleGuide.areasKey)}
            </p>
          </GlassPanel>

          {!canViewFullGuide && (
            <div className="rounded-2xl border border-ops-warn/25 bg-orange-50/50 p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <p className="font-display text-[0.9rem] font-semibold text-ops-ink">{t('help.otherRoleTitle')}</p>
              <p className="mt-2 font-sans text-[0.84rem] leading-relaxed text-slate-600">{t(roleGuide.askWhenKey)}</p>
              <p className="mt-3 font-sans text-[0.8rem] text-slate-500">{t('help.otherRoleHint')}</p>
              {myRole && (
                <button
                  type="button"
                  onClick={() => go('role', myRole)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 font-display text-[0.82rem] font-medium text-ops-accent ring-1 ring-slate-200"
                >
                  {t('help.backToMyRole', { role: t(`labels.role.${myRole}`) })}
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}

          {canViewFullGuide && !viewingOwnRole && myRole === 'OWNER' && (
            <p className="rounded-xl border border-ops-accent/20 bg-indigo-50/70 px-3.5 py-2.5 font-sans text-[0.8rem] text-ops-accent">
              {t('help.ownerFullGuideNote', { role: t(`labels.role.${selectedRole}`) })}
            </p>
          )}

          {canViewFullGuide && (
            <>
              <p className="font-display text-[0.78rem] font-medium tracking-wider text-slate-400 uppercase">
                {viewingOwnRole ? t('help.tasksHeading') : t('help.tasksHeadingForRole', { role: t(`labels.role.${selectedRole}`) })}
              </p>
              <div className="flex flex-col gap-3">
                {roleGuide.tasks.map((task) => (
                  <TaskBlock key={task.id} taskId={task.id} splitNav={task.splitNav} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {section === 'troubleshoot' && (
        <div className="flex flex-col gap-3">
          {HELP_TROUBLE_TOPICS.map((topic) => (
            <GlassPanel key={topic}>
              <h2 className="font-display text-[1rem] font-semibold text-ops-ink">{t(`help.trouble.${topic}.title`)}</h2>
              <p className="mt-2 font-sans text-[0.84rem] leading-relaxed text-slate-600">
                {t(`help.trouble.${topic}.cause`)}
              </p>
              <p className="mt-3 rounded-xl border border-slate-200 bg-ops-canvas px-3.5 py-2.5 font-sans text-[0.82rem] text-ops-ink">
                <span className="font-medium">{t('help.labels.whatToDo')} </span>
                {t(`help.trouble.${topic}.fix`)}
              </p>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
};
