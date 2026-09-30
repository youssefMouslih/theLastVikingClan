import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Avatar from '../components/ui/Avatar';
import Icon from '../components/ui/Icon';
import { Countdown } from '../components/ui/Motion';
import StatusBadge from '../components/ui/StatusBadge';
import { useLocale } from '../i18n/LocaleContext';
import { supabase } from '../lib/supabase';
import { adminSetResult, awardForfeit, confirmResult, disputeResult, getMatch, submitResult } from '../services/matchService';
import { getMember } from '../services/playerService';
import { getEvidenceSignedUrl } from '../services/storageService';
import { useAuthStore } from '../stores/authStore';

const REASON_KEYS = ['reason.incorrect', 'reason.noMatch', 'reason.wrongOpp', 'reason.badShot', 'reason.tag', 'reason.misconduct', 'reason.cheat', 'reason.other'] as const;
const REASON_EN: Record<string, string> = {
  'reason.incorrect': 'Incorrect score',
  'reason.noMatch': 'Match did not happen',
  'reason.wrongOpp': 'Wrong opponent',
  'reason.badShot': 'Invalid screenshot',
  'reason.tag': 'No clan tag',
  'reason.misconduct': 'Misconduct',
  'reason.cheat': 'Suspected cheating',
  'reason.other': 'Other',
};

export default function MatchPage() {
  const { t, fmtDate } = useLocale();
  const { id } = useParams();
  const me = useAuthStore((s) => s.profile);
  const isAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN' || me?.role === 'MODERATOR';
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fairTag, setFairTag] = useState(false);
  const [fairClean, setFairClean] = useState(false);
  const REP_OPTS = ['match.repTag', 'match.repLag', 'match.repConduct'] as const;
  type RepKey = (typeof REP_OPTS)[number];
  const [reports, setReports] = useState<RepKey[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disputeReason, setDisputeReason] = useState<string>(REASON_KEYS[0]);
  const [disputeText, setDisputeText] = useState('');
  const [disputing, setDisputing] = useState(false);

  const matchQuery = useQuery({ queryKey: ['match', id], queryFn: () => getMatch(id ?? ''), enabled: !!id });
  const m = matchQuery.data;

  const namesQuery = useQuery({
    queryKey: ['match-names', m?.player_a_id, m?.player_b_id],
    enabled: !!m,
    queryFn: async () => {
      const [a, b] = await Promise.all([getMember(m!.player_a_id), getMember(m!.player_b_id)]);
      return {
        names: {
          [m!.player_a_id]: a?.display_name ?? a?.username ?? 'Player A',
          [m!.player_b_id]: b?.display_name ?? b?.username ?? 'Player B',
        } as Record<string, string>,
        avatarPaths: {
          [m!.player_a_id]: a?.avatar_url ?? null,
          [m!.player_b_id]: b?.avatar_url ?? null,
        } as Record<string, string | null>,
      };
    },
  });
  const names = namesQuery.data?.names ?? {};
  const avatarPaths = namesQuery.data?.avatarPaths ?? {};

  const evidenceQuery = useQuery({
    queryKey: ['evidence', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from('match_evidence').select('*').eq('match_id', id);
      const rows = (data ?? []) as { id: string; file_path: string }[];
      const urls = await Promise.all(rows.map(async (r) => ({ ...r, url: await getEvidenceSignedUrl(r.file_path) })));
      return urls;
    },
  });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      await fn();
      await Promise.all([matchQuery.refetch(), evidenceQuery.refetch()]);
      setMsg(ok);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  if (matchQuery.isLoading) return <main className="page text-sm">{t('match.loading')}</main>;
  if (!m) return <main className="page text-sm">{t('match.notFound')}</main>;

  const iAmParticipant = me && (me.id === m.player_a_id || me.id === m.player_b_id);
  const iAmOpponent = m.status === 'RESULT_SUBMITTED' && me && me.id !== m.submitted_by && (me.id === m.player_a_id || me.id === m.player_b_id);
  const deadlinePassed = m.deadline ? Date.now() > new Date(m.deadline).getTime() : false;

  return (
    <main className="page">
      <Link to={`/competitions/${m.competition_id}`} className="text-sm font-medium text-brand-400">{t('match.back')}</Link>
      <div className="hero mt-2 p-5 text-center">
        <div className="flex items-center justify-center gap-3">
          <Avatar path={avatarPaths[m.player_a_id]} name={names[m.player_a_id] ?? 'A'} className="h-12 w-12 text-lg" />
          <div className="font-display text-lg tracking-wide">{names[m.player_a_id] ?? '…'}</div>
        </div>
        <div className="font-display my-1 text-5xl tracking-wide">
          {m.score_a != null && m.score_b != null ? `${m.score_a}–${m.score_b}` : 'vs'}
        </div>
        <div className="flex items-center justify-center gap-3">
          <Avatar path={avatarPaths[m.player_b_id]} name={names[m.player_b_id] ?? 'B'} className="h-12 w-12 text-lg" />
          <div className="font-display text-lg tracking-wide">{names[m.player_b_id] ?? '…'}</div>
        </div>
        <p className="mt-2"><StatusBadge value={m.status} /></p>
        <p className="mt-1 flex items-center justify-center gap-1 text-xs opacity-70">
          <Icon name="clock" className="h-3.5 w-3.5" /> {t('match.deadline', { date: m.deadline ? fmtDate(m.deadline) : t('match.noDeadline') })}{deadlinePassed && m.status !== 'CONFIRMED' && m.status !== 'FORFEIT' ? t('match.passed') : ''}
        </p>
        {m.deadline && !deadlinePassed && m.status !== 'CONFIRMED' && m.status !== 'FORFEIT' && (
          <p className="mt-1 flex items-center justify-center gap-1.5">
            <span className="live-dot" aria-hidden /> <Countdown deadline={m.deadline} />
          </p>
        )}
      </div>

      {msg && <p role="status" className="mt-2 text-sm font-medium">{msg}</p>}

      {iAmParticipant && (m.status === 'SCHEDULED' || m.status === 'OVERDUE' || m.status === 'RESULT_SUBMITTED') && (
        <form
          onSubmit={(e) => e.preventDefault()}
          className="card mt-3 flex flex-col gap-2"
        >
          <h2 className="font-display text-sm tracking-wide">{t('match.submit')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="label">{t('match.yourScore', { name: names[m.player_a_id] ?? '' })}<input required type="number" min={0} max={30} inputMode="numeric" className="input h-14 text-center text-2xl font-bold" value={scoreA} onChange={(e) => setScoreA(e.target.value)} /></label>
            <label className="label">{t('match.oppScore', { name: names[m.player_b_id] ?? '' })}<input required type="number" min={0} max={30} inputMode="numeric" className="input h-14 text-center text-2xl font-bold" value={scoreB} onChange={(e) => setScoreB(e.target.value)} /></label>
          </div>
          <label className="label">{t('match.evidence')}
            <span className="file-upload">
              <Icon name="camera" className="h-5 w-5 shrink-0 text-brand-400" />
              <span>{t('match.uploadCta')}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <span className="file-name">{file.name}</span>}
            </span>
          </label>
          <div className="rounded-xl bg-white/5 p-2 text-sm">
            <label className="flex items-start gap-2 py-1">
              <input type="checkbox" checked={fairTag} onChange={(e) => setFairTag(e.target.checked)} className="mt-1 h-5 w-5 accent-[#eab308]" />
              {t('match.fairTag')}
            </label>
            <label className="flex items-start gap-2 py-1">
              <input type="checkbox" checked={fairClean} onChange={(e) => setFairClean(e.target.checked)} className="mt-1 h-5 w-5 accent-[#eab308]" />
              {t('match.fairClean')}
            </label>
          </div>
          <details>
            <summary className="cursor-pointer text-sm underline">{t('match.repTitle')}</summary>
            <div className="mt-1 flex flex-col gap-1 text-sm">
              {REP_OPTS.map((rk) => (
                <label key={rk} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={reports.includes(rk)}
                    onChange={(e) => setReports(e.target.checked ? [...reports, rk] : reports.filter((r) => r !== rk))}
                    className="h-5 w-5 accent-[#ef4444]"
                  />
                  {t(rk)}
                </label>
              ))}
            </div>
          </details>
          <button
            type="button"
            disabled={busy || !fairTag || !fairClean || !file}
            onClick={(e) => {
              e.preventDefault();
              run(async () => {
                await submitResult(m, me!.id, Number(scoreA), Number(scoreB), file);
                if (reports.length > 0) {
                  await disputeResult(m.id, me!.id, 'Fair play report', reports.map((r) => t(r)).join('; '));
                }
              }, reports.length > 0 ? t('match.reportFiled') : t('match.submitted'));
            }}
            className="btn-cta sticky-actions h-12 w-full"
          >
            {busy ? t('match.submitting') : t('match.submit')}
          </button>
        </form>
      )}

      {iAmOpponent && (
        <div className="card mt-3">
          <h2 className="font-bold">{t('match.oppSubmitted', { a: m.score_a ?? 0, b: m.score_b ?? 0 })}</h2>
          <div className="mt-2 flex gap-2">
            <button disabled={busy} onClick={() => run(() => confirmResult(m, me!.id), t('match.confirmed'))} className="btn-primary h-12 flex-1">{t('match.confirm')}</button>
            <button disabled={busy} onClick={() => setDisputing((d) => !d)} className="btn-danger h-12 flex-1">{t('match.wrongBtn')}</button>
          </div>
          {disputing && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-white/5 p-2">
              <select aria-label={t('match.disputeReason')} value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} className="input">
                {REASON_KEYS.map((r) => <option key={r} value={r}>{t(r)}</option>)}
              </select>
              <textarea value={disputeText} onChange={(e) => setDisputeText(e.target.value)} rows={3} placeholder={t('match.disputePlaceholder')} className="input h-auto py-2" />
              <button disabled={busy} onClick={() => run(() => disputeResult(m.id, me!.id, REASON_EN[disputeReason] ?? disputeReason, disputeText), t('match.disputed'))} className="btn-ghost">{t('match.submitDispute')}</button>
            </div>
          )}
        </div>
      )}

      {evidenceQuery.data && evidenceQuery.data.length > 0 && (
        <section className="card mt-3">
          <h2 className="card-title">{t('match.evidenceTitle')}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {evidenceQuery.data.map((e) => (
              e.url ? (
                <img key={e.id} src={e.url} alt="Match evidence" className="max-h-80 w-full rounded-xl border border-white/10 object-contain" loading="lazy" />
              ) : (
                <p key={e.id} className="text-sm opacity-60">{t('match.noAccess')}</p>
              )
            ))}
          </div>
        </section>
      )}

      {isAdmin && (m.status === 'RESULT_SUBMITTED' || m.status === 'DISPUTED') ? (
        <section className="card mt-3 border-brand-500/40" aria-label={t('match.reviewTitle')}>
          <h2 className="card-title">{t('match.reviewTitle')}</h2>
          <p className="font-display mt-1 text-center text-3xl">{m.score_a ?? '–'}–{m.score_b ?? '–'}</p>
          <p className="text-center text-xs opacity-70">
            {names[m.player_a_id] ?? ''} vs {names[m.player_b_id] ?? ''}
            {m.submitted_by ? ` • ${t('match.submittedBy', { name: names[m.submitted_by] ?? m.submitted_by.slice(0, 8), date: m.submitted_at ? fmtDate(m.submitted_at) : '—' })}` : ''}
          </p>
          {(evidenceQuery.data ?? []).length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {evidenceQuery.data!.map((e) => (
                e.url ? (
                  <img key={e.id} src={e.url} alt="Match evidence" className="max-h-80 w-full rounded-xl border border-white/10 object-contain" loading="lazy" />
                ) : (
                  <p key={e.id} className="text-sm opacity-60">{t('match.noAccess')}</p>
                )
              ))}
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input type="number" min={0} placeholder={t('match.scoreA')} aria-label={t('match.scoreA')} value={scoreA} onChange={(e) => setScoreA(e.target.value)} className="input text-center" />
            <input type="number" min={0} placeholder={t('match.scoreB')} aria-label={t('match.scoreB')} value={scoreB} onChange={(e) => setScoreB(e.target.value)} className="input text-center" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {m.score_a != null && (
              <button disabled={busy} onClick={() => run(() => adminSetResult(m.id, m.score_a!, m.score_b!, me!.id, m.competition_id, m.player_a_id, m.player_b_id), t('match.resultSet'))} className="btn-primary h-10 flex-1 px-3 text-xs">{t('match.confirmSubmitted')}</button>
            )}
            <button disabled={busy || scoreA === '' || scoreB === ''} onClick={() => run(() => adminSetResult(m.id, Number(scoreA), Number(scoreB), me!.id, m.competition_id, m.player_a_id, m.player_b_id), t('match.resultSet'))} className="btn-ghost h-10 px-3 text-xs">{t('match.setResult')}</button>
            <button disabled={busy} onClick={() => run(() => awardForfeit(m.id, m.player_a_id, m.player_b_id, me!.id), t('match.forfeitMsgA'))} className="btn-ghost h-10 px-3 text-xs">{t('match.forfeitA')}</button>
            <button disabled={busy} onClick={() => run(() => awardForfeit(m.id, m.player_b_id, m.player_a_id, me!.id), t('match.forfeitB'))} className="btn-ghost h-10 px-3 text-xs">{t('match.forfeitB')}</button>
          </div>
        </section>
      ) : isAdmin && (
        <section className="card mt-3">
          <h2 className="card-title">{t('match.adminResolve')}</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input type="number" min={0} placeholder={t('match.scoreA')} aria-label={t('match.scoreA')} value={scoreA} onChange={(e) => setScoreA(e.target.value)} className="input text-center" />
            <input type="number" min={0} placeholder={t('match.scoreB')} aria-label={t('match.scoreB')} value={scoreB} onChange={(e) => setScoreB(e.target.value)} className="input text-center" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <button disabled={busy} onClick={() => run(() => adminSetResult(m.id, Number(scoreA), Number(scoreB), me!.id, m.competition_id, m.player_a_id, m.player_b_id), t('match.resultSet'))} className="btn-ghost h-10 px-3 text-xs">{t('match.setResult')}</button>
            <button disabled={busy} onClick={() => run(() => awardForfeit(m.id, m.player_a_id, m.player_b_id, me!.id), t('match.forfeitMsgA'))} className="btn-ghost h-10 px-3 text-xs">{t('match.forfeitA')}</button>
            <button disabled={busy} onClick={() => run(() => awardForfeit(m.id, m.player_b_id, m.player_a_id, me!.id), t('match.forfeitB'))} className="btn-ghost h-10 px-3 text-xs">{t('match.forfeitB')}</button>
          </div>
        </section>
      )}
      <BottomNav />
    </main>
  );
}
