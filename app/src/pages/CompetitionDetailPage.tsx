import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import BracketView from '../components/competition/BracketView';
import MatchCard from '../components/match/MatchCard';
import ReplacePlayerButton from '../components/competition/ReplacePlayerButton';
import StandingsTable from '../components/competition/StandingsTable';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import CopyButton from '../components/ui/CopyButton';
import { confirmDialog } from '../components/ui/confirm';
import Icon from '../components/ui/Icon';
import { Countdown, EmptyState, FadeIn, SkeletonList } from '../components/ui/Motion';
import QueryError from '../components/ui/QueryError';
import StatusBadge from '../components/ui/StatusBadge';
import { competitionTypeLabel } from '../i18n/competitionType';
import { statusLabel, useLocale } from '../i18n/LocaleContext';
import { useOath } from '../hooks/useOath';
import { registrationState } from '../competition/deadlineEngine';
import {
  approveDeletion,
  autoRefreshCompetition,
  getCompetition,
  joinCompetition,
  joinWaitlist,
  leaveCompetition,
  listParticipants,
  regenerateJoinCode,
  rejectDeletion,
  reopenRegistration,
  requestDeletion,
  restoreCompetition,
  setCompetitionStatus,
  setJoinEnabled,
  softDeleteCompetition,
  updateCompetition,
  type CompetitionEdit,
} from '../services/competitionService';
import { generateKnockoutFixtures, generateLeagueFixtures, listCompetitionMatches, listRounds, markOverdue, startRound } from '../services/matchService';
import { purgeCompletedEvidence } from '../services/storageService';
import { getStandings } from '../services/standingsService';
import { useAuthStore } from '../stores/authStore';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CompetitionDetailPage() {
  const { t, tError, fmtDate } = useLocale();
  const { sworn, swear } = useOath();
  const { id } = useParams();
  const nav = useNavigate();
  const me = useAuthStore((s) => s.profile);
  const isAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const isStaff = !!me && ['OWNER', 'ADMIN', 'MODERATOR'].includes(me.role);
  const [tab, setTab] = useState<string>('Overview');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [overrideLock, setOverrideLock] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', min_players: 4, max_players: 8, registration_deadline: '', match_deadline_hours: 48 });

  const compQuery = useQuery({ queryKey: ['competition', id], queryFn: () => getCompetition(id ?? '', true), enabled: !!id });
  const partsQuery = useQuery({ queryKey: ['participants', id], queryFn: () => listParticipants(id ?? ''), enabled: !!id });
  const matchesQuery = useQuery({ queryKey: ['matches', id], queryFn: () => listCompetitionMatches(id ?? ''), enabled: !!id });
  const roundsQuery = useQuery({ queryKey: ['rounds', id], queryFn: () => listRounds(id ?? ''), enabled: !!id && (tab === 'Matches' || tab === 'Bracket') });
  const rounds = roundsQuery.data ?? [];
  const standingsQuery = useQuery({
    queryKey: ['standings', id],
    queryFn: () => getStandings(id ?? ''),
    enabled: !!id && (tab === 'Standings' || tab === 'Overview' || tab === 'Stats'),
  });
  const comp = compQuery.data;
  const parts = partsQuery.data ?? [];
  const matches = matchesQuery.data ?? [];
  const TABS = comp && comp.type !== 'LEAGUE'
    ? [t('detail.tabOverview'), t('detail.tabBracket'), t('detail.tabMatches'), t('detail.tabPlayers'), t('detail.tabStats')]
    : [t('detail.tabOverview'), t('detail.tabStandings'), t('detail.tabMatches'), t('detail.tabPlayers'), t('detail.tabStats')];
  const TAB_KEYS = comp && comp.type !== 'LEAGUE' ? ['Overview', 'Bracket', 'Matches', 'Players', 'Stats'] : ['Overview', 'Standings', 'Matches', 'Players', 'Stats'];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const state = comp ? registrationState(Date.now(), comp.registration_start, comp.registration_deadline, parts.length, comp.max_players) : null;
  const stateLabel = state ? statusLabel(t, state) : '';
  const isRegistered = parts.some((p) => p.player_id === me?.id);
  const isFull = parts.length >= (comp?.max_players ?? Infinity);
  const names: Record<string, string> = {};
  for (const p of parts) names[p.player_id] = p.player?.display_name ?? p.player?.username ?? p.player_id.slice(0, 8);
  const avatars: Record<string, string | null> = {};
  for (const p of parts) avatars[p.player_id] = p.player?.avatar_url ?? null;
  const formByPlayer = useMemo(() => {
    const form: Record<string, ('W' | 'D' | 'L')[]> = {};
    const finished = (matchesQuery.data ?? [])
      .filter((m) => m.status === 'CONFIRMED' || m.status === 'FORFEIT')
      .sort((a, b) => new Date(a.confirmed_at ?? a.deadline ?? 0).getTime() - new Date(b.confirmed_at ?? b.deadline ?? 0).getTime());
    for (const match of finished) {
      if (!match.player_a_id || !match.player_b_id) continue;
      const winner = match.winner_id
        ?? (match.score_a != null && match.score_b != null && match.score_a !== match.score_b
          ? (match.score_a > match.score_b ? match.player_a_id : match.player_b_id)
          : null);
      const a: 'W' | 'D' | 'L' = winner === null ? 'D' : winner === match.player_a_id ? 'W' : 'L';
      const b: 'W' | 'D' | 'L' = winner === null ? 'D' : winner === match.player_b_id ? 'W' : 'L';
      (form[match.player_a_id] ??= []).push(a);
      (form[match.player_b_id] ??= []).push(b);
    }
    return form;
  }, [matchesQuery.data]);

  // Automatic lifecycle (§26, §99): close registration / finish / flag overdue on view.
  // Primary driver is the Auto-Jarl cron (0036, every 15 min); this stays as a
  // harmless fallback for instant feedback + the manual check button below.
  const autoRan = useRef<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  useEffect(() => {
    if (!comp || autoRan.current === comp.id) return;
    autoRan.current = comp.id;
    (async () => {
      try {
        const r = await autoRefreshCompetition(comp);
        if (r.needsReview) setNeedsReview(true);
        const overdue = await markOverdue(comp.id);
        if (r.changed || overdue > 0) {
          await Promise.all([compQuery.refetch(), matchesQuery.refetch()]);
          if (r.changed) setMsg(t('detail.autoUpdated'));
        }
      } catch {
        // non-fatal: admin buttons remain
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp?.id]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      await fn();
      await Promise.all([compQuery.refetch(), partsQuery.refetch(), matchesQuery.refetch(), standingsQuery.refetch()]);
      if (ok) setMsg(ok);
    } catch (err) {
      setMsg(tError(err));
    } finally {
      setBusy(false);
    }
  }

  // Round gating strip: a round opens when the previous round is fully
  // played, or when staff force-starts it early. Players see why a round
  // is still locked; staff (moderator included) get a Start button.
  const FINAL = new Set(['CONFIRMED', 'FORFEIT', 'CANCELLED']);
  const roundOpen = (idx: number): boolean => {
    const r = rounds[idx];
    if (!r || r.status === 'ACTIVE') return true;
    if (r.status !== 'SCHEDULED') return false;
    for (let i = 0; i < idx; i++) {
      if (matches.some((m) => m.round_id === rounds[i].id && !FINAL.has(m.status))) return false;
    }
    return true;
  };
  const roundsBar = rounds.length === 0 ? null : (
    <div className="flex flex-col gap-1.5" aria-label="Rounds">
      {rounds.map((r, i) => {
        const done = r.status === 'COMPLETED';
        const open = done || roundOpen(i);
        return (
          <div key={r.id} className="card flex items-center gap-2 p-2 text-sm">
            <span className="flex-1 font-semibold">{r.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${done ? 'bg-zinc-500/15 text-zinc-400' : open ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
              {done ? t('round.done') : open ? t('round.live') : t('round.locked')}
            </span>
            {!done && !open && (
              <span className="hidden text-[11px] opacity-60 sm:inline">{t('round.waitPrev')}</span>
            )}
            {isStaff && !done && r.status === 'SCHEDULED' && (
              <button
                disabled={busy}
                onClick={() => run(() => startRound(r.id, me!.id, me!.role), t('round.started')).then(() => roundsQuery.refetch())}
                className="btn-ghost h-9 px-3 text-xs"
              >
                {t('round.start')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  function startEdit() {
    if (!comp) return;
    setForm({
      name: comp.name,
      description: comp.description ?? '',
      min_players: comp.min_players,
      max_players: comp.max_players,
      registration_deadline: toLocalInput(comp.registration_deadline),
      match_deadline_hours: comp.match_deadline_hours,
    });
    setOverrideLock(false);
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!comp) return;
    const patch: CompetitionEdit = {
      name: form.name.trim(),
      description: form.description || null,
      min_players: form.min_players,
      max_players: form.max_players,
      registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
      match_deadline_hours: form.match_deadline_hours,
    };
    await run(() => updateCompetition(comp, patch, overrideLock), t('detail.updated'));
    setEditing(false);
  }

  const started = comp && ['ACTIVE', 'FINISHED', 'ARCHIVED'].includes(comp.status);

  if (compQuery.isLoading) return <main className="page" aria-busy="true"><SkeletonList rows={4} /></main>;
  if (compQuery.isError) return <main className="page"><QueryError error={compQuery.error} onRetry={() => void compQuery.refetch()} /></main>;
  if (!comp || (comp.is_deleted && !isAdmin)) return <main className="page text-sm">{t('detail.notFound')}</main>;
  const hasStarted = matches.length > 0 || ['ACTIVE', 'FINISHED', 'ARCHIVED'].includes(comp.status);
  const pendingDelete = !!comp.delete_requested_by && !comp.is_deleted;
  const ownRequest = comp.delete_requested_by === me?.id;

  return (
    <main className="page">
      <div className="mb-3 flex items-center gap-2">
        <Link to="/competitions" className="flex min-h-11 flex-1 items-center gap-2 text-sm font-semibold text-brand-400">
          <Icon name="back" className="h-4 w-4" /> {t('detail.back')}
        </Link>
        <button
          type="button"
          aria-label={t('common.refresh')}
          onClick={() => run(async () => {}, '')}
          disabled={busy}
          className="btn-ghost h-11 w-11 px-0!"
        >
          <Icon name="refresh" className="h-4 w-4" />
        </button>
      </div>
      <header className="hero">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <Icon name={comp.type === 'LEAGUE' ? 'trophy' : 'swords'} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">{competitionTypeLabel(t, comp.type)}</p>
            <h1 className="font-display mt-1 wrap-break-word text-xl tracking-wide sm:text-2xl">{comp.name}</h1>
          </div>
        </div>
        {comp.description && <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/75">{comp.description}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge value={comp.status} />
          <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-[11px] font-bold text-brand-300">{stateLabel}</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-sm">
          <div>
            <dt className="text-xs text-white/60">{t('detail.tabPlayers')}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{parts.length} <span className="font-normal text-white/60">/ {comp.max_players}</span></dd>
          </div>
          <div>
            <dt className="text-xs text-white/60">{t('detail.tabMatches')}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{matches.length}</dd>
          </div>
        </dl>
      </header>
      {needsReview && (
        <p role="alert" className="card mt-2 border-amber-400 text-sm">{t('detail.needsReview')}</p>
      )}
      {comp.is_deleted && isAdmin && (
        <div role="alert" className="card mt-2 border-red-500/50 text-sm">
          <p className="font-bold">{t('detail.deletedBanner')}</p>
          <button disabled={busy} onClick={() => run(() => restoreCompetition(comp.id, me!.id), t('detail.restored'))} className="btn-ghost mt-2 h-10 px-3 text-xs">{t('detail.restore')}</button>
        </div>
      )}
      {pendingDelete && isAdmin && (
        <div role="alert" className="card mt-2 border-amber-400 text-sm">
          <p className="font-bold">{t('detail.pendingTitle')}</p>
          <p className="opacity-80">{ownRequest ? t('detail.ownRequest') : t('detail.pendingDesc')}</p>
          {!ownRequest && (
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={async () => { if (await confirmDialog({ message: t('detail.approveConfirm'), danger: true })) run(() => approveDeletion(comp, me!.id), t('detail.approved')); }} className="btn-danger h-10 px-3 text-xs">{t('detail.approveDelete')}</button>
              <button disabled={busy} onClick={() => run(() => rejectDeletion(comp.id, me!.id), t('detail.rejectedReq'))} className="btn-ghost h-10 px-3 text-xs">{t('detail.rejectReq')}</button>
            </div>
          )}
        </div>
      )}

      <section aria-label={t('detail.registration', { state: stateLabel })} className="card mt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="card-title">{t('detail.registration', { state: stateLabel })}</h2>
            <p className="mt-1 text-sm opacity-80">
              {comp.registration_deadline ? `${t('detail.closes', { date: fmtDate(comp.registration_deadline) })} ` : ''}
              {isFull ? t('detail.full') : t('detail.slotsLeft', { n: comp.max_players - parts.length })}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-(--border) bg-(--surface-2) px-2.5 py-1 text-xs font-bold tabular-nums">
            {parts.length}/{comp.max_players}
          </span>
        </div>
        <progress
          className="mt-3 block h-2 w-full overflow-hidden rounded-full accent-brand-500"
          value={Math.min(parts.length, comp.max_players)}
          max={comp.max_players}
          aria-label={`${parts.length} / ${comp.max_players} ${t('detail.tabPlayers')}`}
        />
        {state === 'OPEN' && comp.registration_deadline && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm">
            <span className="live-dot" aria-hidden /> <Countdown deadline={comp.registration_deadline} urgentHours={12} />
          </p>
        )}
        {msg && <p role="status" aria-live="polite" className="mt-2 rounded-lg bg-(--surface-2) px-3 py-2 text-sm font-medium">{msg}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {!isRegistered ? (
            !sworn ? (
              <div className="flex w-full flex-col gap-2 rounded-xl border border-(--border) bg-(--surface-2) p-3 text-sm">
                <p className="font-bold">{t('code.oathGate')}</p>
                <div className="flex gap-2">
                  <Link to="/code" className="btn-ghost flex-1">{t('code.tabOath')}</Link>
                  <button
                    disabled={busy}
                    onClick={async () => { await run(() => swear(), t('code.oathSworn')); }}
                    className="btn-cta flex-1"
                  >
                    {t('code.oathSwear')}
                  </button>
                </div>
              </div>
            ) : isFull ? (
              <button disabled={busy} onClick={() => run(() => joinWaitlist(comp.id, me!.id), t('detail.waitlistAdded'))} className="btn-primary flex-1">
                {t('detail.joinWaitlist', { count: parts.length, max: comp.max_players })}
              </button>
            ) : (
              <button disabled={busy || state !== 'OPEN'} onClick={() => run(() => joinCompetition(comp.join_code), t('detail.registered')).then(() => setTab('Players'))} className="btn-primary flex-1">
                {t('detail.join')}
              </button>
            )
          ) : (
            <button disabled={busy} onClick={async () => { if (await confirmDialog({ message: t('detail.leaveConfirm'), danger: true })) run(() => leaveCompetition(comp.id), t('detail.left')); }} className="btn-ghost">
              {t('detail.leave')}
            </button>
          )}
        </div>
        <p className="mt-3 break-all text-xs opacity-70">{t('detail.joinLink')} <code className="font-mono text-(--text)">/join/{comp.join_code}</code>{comp.join_enabled ? '' : ` ${t('detail.disabled')}`}</p>
        {parts.length > 0 && (
          <div className="mt-3 flex items-center gap-2" aria-label={t('detail.tabPlayers')}>
            <div className="flex -space-x-2">
              {parts.slice(0, 8).map((p) => (
                <Avatar key={p.player_id} path={p.player?.avatar_url} name={names[p.player_id]} className="h-7 w-7 border-2 border-(--surface) text-[10px]" />
              ))}
            </div>
            {parts.length > 8 && <span className="text-xs opacity-70">+{parts.length - 8}</span>}
          </div>
        )}
      </section>

      {isAdmin && (
        <section aria-label={t('detail.admin')} className="card mt-3">
          <div className="flex items-center gap-2">
            <h2 className="card-title flex-1">{t('detail.admin')}</h2>
            {!editing && <button onClick={startEdit} className="btn-ghost h-11 px-4 text-xs">{t('common.edit')}</button>}
          </div>
          <p className="mt-3 font-mono text-sm">{t('detail.code')} <span className="font-bold tracking-wider">{comp.join_code}</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            <CopyButton text={comp.join_code} label={t('common.copy')} />
            <CopyButton text={`${window.location.origin}/join/${comp.join_code}`} label={t('common.inviteLink')} />
          </div>
          {editing ? (
            <form onSubmit={saveEdit} className="mt-2 flex flex-col gap-2">
              <label className="label">{t('detail.editName')}<input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="label">{t('detail.editDesc')}<textarea className="input h-auto py-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="label">{t('detail.editMin')}<input type="number" min={2} max={32} className="input" value={form.min_players} onChange={(e) => setForm({ ...form, min_players: Number(e.target.value) })} /></label>
                <label className="label">{t('detail.editMax')}<input type="number" min={2} max={32} className="input" value={form.max_players} onChange={(e) => setForm({ ...form, max_players: Number(e.target.value) })} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="label">{t('detail.editDeadline')}<input type="datetime-local" className="input" value={form.registration_deadline} onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })} /></label>
                <label className="label">{t('detail.editMatchHours')}<input type="number" min={1} max={336} className="input" value={form.match_deadline_hours} onChange={(e) => setForm({ ...form, match_deadline_hours: Number(e.target.value) })} /></label>
              </div>
              {started && (
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={overrideLock} onChange={(e) => setOverrideLock(e.target.checked)} className="mt-1" />
                  {t('detail.override')}
                </label>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="submit" disabled={busy} className="btn-primary flex-1">{t('common.save')}</button>
                <button type="button" onClick={() => setEditing(false)} className="btn-ghost">{t('common.cancel')}</button>
              </div>
            </form>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => run(() => comp.type === 'LEAGUE' ? generateLeagueFixtures(comp.id).then((n) => setMsg(t('detail.fixturesLeague', { n }))) : generateKnockoutFixtures(comp.id).then((n) => setMsg(t('detail.fixturesCup', { n }))), '')} className="btn-dark h-11 px-3 text-xs">
                {comp.type === 'LEAGUE' ? t('detail.generateLeague') : t('detail.generateCup')}
              </button>
              <button disabled={busy} onClick={() => run(() => markOverdue(comp.id).then((n) => setMsg(t('detail.overdueMarked', { n }))), '')} className="btn-ghost h-11 px-3 text-xs">{t('detail.checkDeadlines')}</button>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const n = await purgeCompletedEvidence(comp.id);
                    setMsg(t('detail.purged', { n }));
                  }, '')
                }
                className="btn-ghost h-11 px-3 text-xs"
              >
                {t('detail.freeStorage')}
              </button>
              <button disabled={busy} onClick={() => run(async () => { const c = await regenerateJoinCode(comp.id); setMsg(t('detail.newCode', { code: c })); }, '')} className="btn-ghost h-11 px-3 text-xs">{t('detail.regenCode')}</button>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-(--border) pt-3">
              <button disabled={busy} onClick={() => run(() => setJoinEnabled(comp.id, !comp.join_enabled), t('detail.joinToggled'))} className="btn-ghost h-11 px-3 text-xs">{comp.join_enabled ? t('detail.disableJoin') : t('detail.enableJoin')}</button>
              <button disabled={busy} onClick={() => run(() => setCompetitionStatus(comp.id, 'REGISTRATION_CLOSED'), t('detail.regClosed'))} className="btn-ghost h-11 px-3 text-xs">{t('detail.closeReg')}</button>
              {(comp.status === 'REGISTRATION_CLOSED' || comp.status === 'DRAFT') && (
                <button disabled={busy} onClick={() => run(() => reopenRegistration(comp).then((note) => setMsg(note)), '')} className="btn-ghost h-11 px-3 text-xs">{t('detail.reopenReg')}</button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await setCompetitionStatus(comp.id, 'FINISHED');
                    const n = await purgeCompletedEvidence(comp.id).catch(() => 0);
                    setMsg(`${t('detail.finished')} ${t('detail.purged', { n })}`);
                  }, '')
                }
                className="btn-ghost h-11 px-3 text-xs"
              >
                {t('detail.finish')}
              </button>
              <button disabled={busy} onClick={() => run(() => setCompetitionStatus(comp.id, 'ARCHIVED'), t('detail.archived'))} className="btn-ghost h-11 px-3 text-xs">{t('detail.archive')}</button>
              {hasStarted ? (
                !pendingDelete && (
                  <button disabled={busy} onClick={async () => { if (await confirmDialog({ message: t('detail.requestConfirm'), danger: true })) run(() => requestDeletion(comp.id, me!.id), t('detail.reqSent')); }} className="btn-danger h-11 px-3 text-xs">{t('detail.requestDelete')}</button>
                )
              ) : (
                <button disabled={busy} onClick={async () => { if (await confirmDialog({ message: t('detail.deleteConfirm', { name: comp.name }), danger: true })) run(() => softDeleteCompetition(comp.id, me!.id), t('detail.deleted')).then(() => nav('/competitions')); }} className="btn-danger h-11 px-3 text-xs">{t('detail.delete')}</button>
              )}
              </div>
            </div>
          )}
        </section>
      )}

      <div role="tablist" aria-label={t('comps.title')} aria-orientation="horizontal" className="mt-4 flex gap-1 overflow-x-auto border-b border-black/10 dark:border-white/10">
        {TABS.map((label, i) => {
          const key = TAB_KEYS[i];
          const count = key === 'Players' ? ` (${parts.length})` : key === 'Matches' || key === 'Bracket' ? ` (${matches.length})` : '';
          return (
            <button
              key={key}
              ref={(element) => { tabRefs.current[i] = element; }}
              id={`competition-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls="competition-tab-panel"
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(event) => {
                const rtl = document.documentElement.dir === 'rtl';
                const direction = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? TAB_KEYS.length - 1 : direction ? (i + direction + TAB_KEYS.length) % TAB_KEYS.length : -1;
                if (next >= 0) {
                  event.preventDefault();
                  setTab(TAB_KEYS[next]);
                  tabRefs.current[next]?.focus();
                }
              }}
              className={`h-12 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors ${tab === key ? 'border-brand-500 text-brand-400' : 'border-transparent opacity-60 hover:opacity-100'}`}
            >
              {label}{count}
            </button>
          );
        })}
      </div>

      <section id="competition-tab-panel" role="tabpanel" tabIndex={0} aria-labelledby={`competition-tab-${tab}`} className="mt-4 focus-visible:rounded-xl">
        {tab === 'Overview' && (
          <div className="flex flex-col gap-3">
            <div className="card">
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <p>{t('detail.format')} <span className="font-semibold">{comp.format ?? '—'}</span></p>
                <p className="text-(--muted)">{comp.type === 'LEAGUE' ? t('admin.typeLeague') : comp.type === 'CUP' ? t('admin.typeCup') : comp.type === 'TOURNAMENT' ? t('admin.typeTournament') : t('admin.typeSpecial')}</p>
                <p>{t('detail.matchDeadline', { h: comp.match_deadline_hours })}</p>
                <p className="font-semibold tabular-nums">{t('detail.points', { w: comp.points_win, d: comp.points_draw, l: comp.points_loss })}</p>
                {comp.start_date && <p>{t('detail.starts', { date: fmtDate(comp.start_date) })}</p>}
                {comp.end_date && <p>{t('detail.ends', { date: fmtDate(comp.end_date) })}</p>}
              </div>
            </div>
            {standingsQuery.isError && <QueryError error={standingsQuery.error} onRetry={() => void standingsQuery.refetch()} compact />}
            {standingsQuery.data && standingsQuery.data.length > 0 && (
              <StandingsTable rows={standingsQuery.data.slice(0, 5)} names={names} form={formByPlayer} highlightPlayerId={me?.id ?? null} />
            )}
          </div>
        )}
        {tab === 'Standings' && (
          standingsQuery.isLoading ? <div aria-busy="true" aria-label={t('common.loading')}><SkeletonList rows={4} /></div> :
          <StandingsTable rows={standingsQuery.data ?? []} names={names} form={formByPlayer} highlightPlayerId={me?.id ?? null} />
        )}
        {tab === 'Matches' && (
          <div className="flex flex-col gap-2" aria-busy={matchesQuery.isLoading}>
            {roundsBar}
            {matchesQuery.isLoading && <SkeletonList rows={4} />}
            {!matchesQuery.isLoading && matches.length === 0 && <EmptyState icon={<Icon name="swords" className="h-8 w-8" />} title={t('detail.tabMatches')} hint={t('detail.noFixtures')} />}
            {matches.map((m, i) => <FadeIn key={m.id} delay={Math.min(i * 50, 400)}><MatchCard match={m} names={names} avatars={avatars} compName={comp.name} /></FadeIn>)}
          </div>
        )}
        {tab === 'Bracket' && (
          <div className="flex flex-col gap-2" aria-busy={matchesQuery.isLoading}>
            {matchesQuery.isLoading && <SkeletonList rows={4} />}
            {!matchesQuery.isLoading && matches.length === 0 && <EmptyState icon={<Icon name="trophy" className="h-8 w-8" />} title={t('detail.tabBracket')} hint={t('detail.noBracket')} />}
            {!matchesQuery.isLoading && matches.length > 0 && (
              roundsQuery.isLoading ? <SkeletonList rows={2} /> : <BracketView rounds={rounds} matches={matches} names={names} avatars={avatars} meId={me?.id ?? null} />
            )}
            {isStaff && rounds.length > 0 && <div className="flex flex-col gap-1.5"><p className="text-xs font-semibold uppercase tracking-wide opacity-60">{t('detail.roundStatus')}</p>{roundsBar}</div>}
          </div>
        )}
        {tab === 'Players' && (
          <div className="flex flex-col gap-2">
            {partsQuery.isError && <p className="text-sm text-red-500">{t('clan.membersError')}</p>}
            {parts.length === 0 && !partsQuery.isError && <p className="text-sm opacity-70">{t('detail.noPlayers')}</p>}
            {parts.map((p) => (
              <div key={p.id} className="card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar path={p.player?.avatar_url} name={names[p.player_id]} className="h-9 w-9 text-sm" />
                  <Link to={`/players/${p.player_id}`} className="flex-1">
                    <span className="font-semibold">{p.player?.display_name ?? p.player?.username ?? p.player_id}</span>
                    <span className="opacity-60"> • {t('detail.joined', { date: new Date(p.joined_at).toLocaleDateString() })}</span>
                    {p.status === 'REPLACED' && <StatusBadge value="REPLACED" className="ms-1" />}
                  </Link>
                  {isAdmin && p.status !== 'REPLACED' && (
                    <ReplacePlayerButton
                      competitionId={comp.id}
                      originalId={p.player_id}
                      originalName={p.player?.display_name ?? p.player?.username ?? 'player'}
                      memberIds={parts.map((x) => x.player_id)}
                      onDone={(mm) => run(async () => {}, mm)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'Stats' && (
          standingsQuery.isLoading ? <p className="text-sm">{t('common.loading')}</p> :
          (standingsQuery.data ?? []).length === 0 ? (
            <p className="card text-sm opacity-70">{t('detail.noStats')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="card text-sm">
                <span className="font-bold">{t('detail.leader')} </span>
                {names[standingsQuery.data![0].player_id] ?? ''} ({t('detail.pts', { n: standingsQuery.data![0].points })}, {t('detail.gd', { n: standingsQuery.data![0].goal_difference })})
              </div>
              <StandingsTable rows={standingsQuery.data!} names={names} />
            </div>
          )
        )}
      </section>
      <BottomNav />
    </main>
  );
}
