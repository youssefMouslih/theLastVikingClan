import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import Avatar from '../components/ui/Avatar';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import CopyButton from '../components/ui/CopyButton';
import { usePersistentTab } from '../hooks/usePersistentTab';
import { Lightbox } from '../components/ui/Motion';
import Icon from '../components/ui/Icon';
import { EmptyState, FadeIn } from '../components/ui/Motion';
import SquadsTab from '../components/battle/SquadsTab';
import StatusBadge from '../components/ui/StatusBadge';
import { useLocale } from '../i18n/LocaleContext';
import {
  acceptOpenBattle,
  cancelChallenge,
  confirmBattleResult,
  expireStaleOpenCalls,
  issueChallenge,
  listBattleHistory,
  listIncoming,
  listOpenBattles,
  listOutgoing,
  renewCall,
  respondChallenge,
  submitBattleResult,
  type ChallengeRow,
} from '../services/challengeService';
import { getCurrentReign } from '../services/throneService';
import { listActiveMembers } from '../services/playerService';
import type { ChallengeType } from '../types/database';
import { battlePoster, shareFile } from '../utils/shareBattle';
import { getBattleEvidenceUrl } from '../services/storageService';
import { useAuthStore } from '../stores/authStore';

function BattleEvidence({ path }: { path: string }) {
  const query = useQuery({ queryKey: ['battle-evidence', path], queryFn: () => getBattleEvidenceUrl(path) });
  const [zoom, setZoom] = useState(false);
  if (!query.data) return null;
  return (
    <>
      <button type="button" onClick={() => setZoom(true)} className="block w-full" aria-label="Evidence">
        <img src={query.data} alt="Battle evidence" className="mt-1 max-h-64 w-full rounded-xl border border-white/10 object-contain" loading="lazy" />
      </button>
      {zoom && <Lightbox src={query.data} onClose={() => setZoom(false)} />}
    </>
  );
}

const TYPES: ChallengeType[] = ['HEAD', 'FRIENDLY', 'HONOR', 'REMATCH', 'WAR'];
const CONDS = ['battle.cSTD', 'battle.cCUSTOM', 'battle.cTOUR'] as const;
const STAKES = ['battle.sNONE', 'battle.sRANK', 'battle.sTITLE'] as const;
const COMMANDS = [
  { title: 'battle.cmdCall', sub: 'battle.cmdCallSub', text: 'battle.cmdCallText' },
  { title: 'battle.cmdFriendly', sub: 'battle.cmdFriendlySub', text: 'battle.cmdFriendlyText' },
  { title: 'battle.cmdRematch', sub: 'battle.cmdRematchSub', text: 'battle.cmdRematchText' },
  { title: 'battle.cmdCrown', sub: 'battle.cmdCrownSub', text: 'battle.cmdCrownText' },
] as const;

function nameOf(p: { display_name: string | null; username: string } | null | undefined, fallback: string): string {
  return p?.display_name ?? p?.username ?? fallback;
}

export default function BattlesPage() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [params] = useSearchParams();
  const initialTab = (['issue', 'incoming', 'open', 'squads', 'history', 'commands'] as const).find((tb) => tb === params.get('tab')) ?? 'issue';
  const [tab, setTab] = usePersistentTab('vik-tab-battles', initialTab, ['issue', 'incoming', 'open', 'squads', 'history', 'commands'] as const);
  const [form, setForm] = useState({ opponent_id: params.get('opponent') ?? '', opponent_label: '', type: 'HEAD' as ChallengeType, conditions: 'battle.cSTD', stakes: 'battle.sNONE', for_throne: false, forced: false, openCall: false });
  const [rivalName, setRivalName] = useState('');
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>({});
  const [shots, setShots] = useState<Record<string, File | null>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const incomingQuery = useQuery({ queryKey: ['battles-in', me?.id], queryFn: () => listIncoming(me!.id), enabled: !!me });
  const outgoingQuery = useQuery({ queryKey: ['battles-out', me?.id], queryFn: () => listOutgoing(me!.id), enabled: !!me });
  const historyQuery = useQuery({ queryKey: ['battles-hist', me?.id], queryFn: () => listBattleHistory(me!.id), enabled: !!me });
  const incoming = incomingQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const outgoing = outgoingQuery.data ?? [];
  const openQuery = useQuery({ queryKey: ['battles-open'], queryFn: () => listOpenBattles(me!.id), enabled: !!me });
  const openBattles = openQuery.data ?? [];

  // Ghost sweep: expired open calls vanish on view.
  const swept = useRef(false);
  useEffect(() => {
    if (!me || swept.current) return;
    swept.current = true;
    expireStaleOpenCalls().then((n) => {
      if (n > 0) openQuery.refetch();
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);
  const reignQuery = useQuery({ queryKey: ['throne'], queryFn: () => getCurrentReign().catch(() => null) });
  const holderId = reignQuery.data?.holder_id ?? null;
  const candidates = (membersQuery.data ?? []).filter((m) => m.id !== me?.id);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      await fn();
      await Promise.all([incomingQuery.refetch(), outgoingQuery.refetch(), historyQuery.refetch(), openQuery.refetch()]);
      if (ok) setMsg(ok);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    await run(
      async () => {
        if (form.for_throne) {
          if (form.type !== 'HONOR') throw new Error('Throne battles must be Honor Duels.');
          if (!holderId) throw new Error('The throne is vacant - ask an admin to crown a champion.');
          if (form.opponent_id !== holderId) throw new Error(t('throne.mustTarget'));
        }
        await issueChallenge(
          {
            opponent_id: form.opponent_id || null,
            opponent_label: form.opponent_id ? null : form.opponent_label || null,
            type: form.type,
            conditions: t(form.conditions as 'battle.cSTD'),
            stakes: form.for_throne ? t('throne.title') : t(form.stakes as 'battle.sNONE'),
            for_throne: form.for_throne,
            forced: form.forced && form.type === 'HEAD' && !!form.opponent_id,
            openCall: form.openCall && form.type === 'FRIENDLY',
          },
          me!.id,
        );
      },
      t('battle.issued'),
    );
    setForm({ opponent_id: '', opponent_label: '', type: 'HEAD', conditions: 'battle.cSTD', stakes: 'battle.sNONE', for_throne: false, forced: false, openCall: false });
  }

  function rematchOf(ch: ChallengeRow) {
    setForm({
      opponent_id: ch.challenger_id === me?.id ? (ch.opponent_id ?? '') : ch.challenger_id,
      opponent_label: '',
      type: 'REMATCH',
      conditions: 'battle.cSTD',
      stakes: 'battle.sNONE',
      for_throne: false,
      forced: false,
      openCall: false,
    });
    setTab('issue');
  }

  function OwnCallControls({ ch }: { ch: ChallengeRow }) {
    const left = ch.expires_at ? Math.max(0, Math.floor((new Date(ch.expires_at).getTime() - Date.now()) / 3600000)) : null;
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="status-badge rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-300">{t('battle.yours')}</span>
        {left != null && <span className="text-[11px] opacity-60">{t('battle.expiresIn', { n: left })}</span>}
        <span className="flex gap-1">
          <button
            disabled={busy}
            onClick={() => run(() => renewCall(ch.id), t('battle.renewed'))}
            className="btn-ghost h-8 px-2 text-[11px]"
          >
            {t('battle.renew')}
          </button>
          <button
            disabled={busy}
            onClick={() => { if (confirm(t('battle.cancel') + '?')) run(() => cancelChallenge(ch, me!.id), t('battle.cancelled')); }}
            className="btn-ghost h-8 px-2 text-[11px]"
          >
            {t('battle.cancel')}
          </button>
        </span>
      </div>
    );
  }

  function BattleCard({ ch, incoming: isIn }: { ch: ChallengeRow; incoming: boolean }) {    const [sharing, setSharing] = useState(false);
    const other = ch.challenger_id === me?.id ? ch.opponent : ch.challenger;
    const otherName = ch.opponent_label ?? nameOf(other, '?');
    const chalName = nameOf(ch.challenger, '?');
    const oppName = ch.opponent_label ?? nameOf(ch.opponent, '?');
    const s = scores[ch.id] ?? { a: '', b: '' };
    const set = (patch: Partial<typeof s>) => setScores({ ...scores, [ch.id]: { ...s, ...patch } });
    const iSubmit = ch.submitted_by === me?.id;
    const needsMyConfirm = ch.status === 'RESULT_SUBMITTED' && !iSubmit;
    return (
      <article className="card p-3 text-sm">
        <div className="flex items-center gap-2">
          <Avatar path={other?.avatar_url} name={otherName} className="h-9 w-9 text-sm" />
          <div className="flex-1">
            <p className="font-bold">{otherName}</p>
            <p className="text-xs opacity-70">{t(`battle.t${ch.type}` as 'battle.tHEAD')} • {ch.stakes}</p>
          </div>
          {ch.for_throne && <span className="status-badge rounded-full bg-accent-500/15 px-2 py-0.5 text-[11px] text-accent-400">{t('throne.title')}</span>}
          {ch.forced && <span className="status-badge rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">100 GP</span>}
          <StatusBadge value={ch.status} />
        </div>
        {isIn && ch.status === 'PENDING' && ch.forced && (
          <p className="mt-1 text-xs font-bold text-red-400">{t('battle.must')}</p>
        )}
        {ch.score_a != null && (
          <p className="font-display mt-1 text-center text-xl">{ch.score_a}–{ch.score_b}</p>
        )}
        {ch.status === 'RESULT_SUBMITTED' && ch.evidence_path && (
          <p className="mt-1 text-center"><BattleEvidence path={ch.evidence_path} /></p>
        )}
        {msg && null}
        <div className="mt-2 flex flex-wrap gap-2">
          {isIn && ch.status === 'PENDING' && (
            <>
              <button disabled={busy} onClick={() => run(() => respondChallenge(ch, me!.id, true), t('battle.answered'))} className="btn-primary h-10 flex-1 text-xs">{t('battle.accept')}</button>
              {!ch.forced && (
                <button disabled={busy} onClick={() => run(() => respondChallenge(ch, me!.id, false), t('battle.answered'))} className="btn-ghost h-10 flex-1 text-xs">{t('battle.decline')}</button>
              )}
            </>
          )}
          {ch.status === 'ACCEPTED' && !iSubmit && ch.submitted_by == null && (
            <div className="flex w-full flex-col gap-2">
              <div className="flex gap-2">
                <input type="number" min={0} placeholder={chalName} aria-label={chalName} value={s.a} onChange={(e) => set({ a: e.target.value })} className="input h-10 text-center" />
                <input type="number" min={0} placeholder={oppName} aria-label={oppName} value={s.b} onChange={(e) => set({ b: e.target.value })} className="input h-10 text-center" />
              </div>
              <label className="file-upload text-xs">
                <span>{t('match.uploadCta')} *</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('match.evidence')} onChange={(e) => setShots({ ...shots, [ch.id]: e.target.files?.[0] ?? null })} />
                {shots[ch.id] && <span className="file-name">{shots[ch.id]!.name}</span>}
              </label>
              {!shots[ch.id] && <p className="text-xs font-medium text-amber-500">{t('battle.needShot')}</p>}
              <button disabled={busy || !shots[ch.id]} onClick={() => run(() => submitBattleResult(ch, me!.id, Number(s.a), Number(s.b), shots[ch.id]), t('battle.submitted'))} className="btn-primary h-10 flex-1 text-xs">{t('battle.submitScore')}</button>
            </div>
          )}
          {needsMyConfirm && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const outcome = await confirmBattleResult(ch, me!.id);
                  setMsg(outcome === 'transfer' ? t('throne.transfer') : outcome === 'defended' ? t('throne.defended') : t('battle.confirmed'));
                }, '')
              }
              className="btn-primary h-10 flex-1 text-xs"
            >
              {t('battle.confirmScore')}
            </button>
          )}
          {ch.status === 'ACCEPTED' && other && (other as { whatsapp?: string | null }).whatsapp && (
            <a
              href={`https://wa.me/${((other as { whatsapp?: string | null }).whatsapp ?? '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(t('battle.waFight', { name: nameOf(other, '?') }))}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 items-center justify-center gap-1 rounded-xl bg-[#25d366] px-3 text-xs font-bold text-white"
            >
              <Icon name="chat" className="h-4 w-4" /> WhatsApp
            </a>
          )}
          {ch.status === 'RESULT_SUBMITTED' && iSubmit && (
            <p className="text-xs opacity-70">{t('match.submitted')}</p>
          )}
          {(ch.status === 'PENDING' || ch.status === 'ACCEPTED') && !isIn && (
            <button disabled={busy} onClick={() => { if (confirm(t('battle.cancel') + '?')) run(() => cancelChallenge(ch, me!.id), t('battle.cancelled')); }} className="btn-ghost h-9 px-3 text-xs">{t('battle.cancel')}</button>
          )}
          {!isIn && (
            <button
              disabled={sharing}
              onClick={async () => {
                setSharing(true);
                try {
                  const file = await battlePoster({ challenger: chalName, opponent: oppName, typeLabel: t(`battle.t${ch.type}` as 'battle.tHEAD'), forced: ch.forced });
                  await shareFile(file, `${chalName} vs ${oppName} — VIK Clan`);
                  setMsg(t('battle.shared'));
                } catch (e) {
                  if (e instanceof Error && e.name !== 'AbortError') setMsg(t('battle.shareFail'));
                } finally {
                  setSharing(false);
                }
              }}
              className="btn-ghost h-9 px-3 text-xs"
            >
              {sharing ? t('common.loading') : t('battle.share')}
            </button>
          )}
          {(ch.status === 'COMPLETED' || ch.status === 'CANCELLED' || ch.status === 'DECLINED') && ch.opponent_id && (
            <button onClick={() => rematchOf(ch)} className="btn-ghost h-9 px-3 text-xs">{t('battle.rematch')}</button>
          )}
        </div>
      </article>
    );
  }

  return (
    <main className="page">
      <AppBar title={t('battle.title')} />
      {msg && <p className="mt-1 text-sm font-medium">{msg}</p>}

      <nav aria-label="Battles" className="mt-2 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {(['issue', 'incoming', 'open', 'squads', 'history', 'commands'] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`h-11 shrink-0 px-3 text-sm font-semibold ${tab === tb ? 'border-b-2 border-brand-500 text-brand-400' : 'opacity-60'}`}
          >
            {tb === 'issue' ? t('battle.issue') : tb === 'incoming' ? `${t('battle.incoming')}${incoming.length ? ` (${incoming.length})` : ''}` : tb === 'open' ? `${t('battle.openMat')}${openBattles.length ? ` (${openBattles.length})` : ''}` : tb === 'squads' ? t('squad.title') : tb === 'history' ? t('battle.history') : t('battle.commands')}
          </button>
        ))}
      </nav>
      {tab === 'issue' && (
        <form onSubmit={issue} className="card mt-3 flex flex-col gap-2">
          <label className="flex items-start gap-2 rounded-xl bg-white/5 p-2 text-sm">
            <input
              type="checkbox"
              checked={form.openCall}
              onChange={(e) => {
                if (e.target.checked) setForm({ ...form, openCall: true, type: 'FRIENDLY', opponent_id: '', opponent_label: '' });
                else setForm({ ...form, openCall: false });
              }}
              className="mt-1 h-5 w-5 accent-[#eab308]"
            />
            <span>{t('battle.openCall')} <span className="opacity-70">({t('battle.openCallDesc')})</span></span>
          </label>
          {!form.openCall && (
          <label className="label">{t('battle.opponent')}
            <select value={form.opponent_id} onChange={(e) => setForm({ ...form, opponent_id: e.target.value, opponent_label: '' })} className="input text-sm">
              <option value="">{t('battle.selectOpp')}</option>
              {candidates.map((m) => <option key={m.id} value={m.id}>{m.display_name ?? m.username}</option>)}
            </select>
          </label>
          )}
          {!form.opponent_id && !form.openCall && (
            <label className="label">{t('battle.external')}
              <input value={form.opponent_label} onChange={(e) => setForm({ ...form, opponent_label: e.target.value })} className="input text-sm" />
            </label>
          )}
          <label className="label">{t('battle.type')}
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ChallengeType, openCall: e.target.value === 'FRIENDLY' ? form.openCall : false })} className="input text-sm">
              {TYPES.map((ty) => <option key={ty} value={ty}>{t(`battle.t${ty}` as 'battle.tHEAD')}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="label">{t('battle.conditions')}
              <select value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} className="input text-sm">
                {CONDS.map((c) => <option key={c} value={c}>{t(c)}</option>)}
              </select>
            </label>
            <label className="label">{t('battle.stakes')}
              <select value={form.stakes} onChange={(e) => setForm({ ...form, stakes: e.target.value })} className="input text-sm" disabled={form.for_throne}>
                {STAKES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
              </select>
            </label>
          </div>
          {form.type === 'HONOR' && holderId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.for_throne} onChange={(e) => setForm({ ...form, for_throne: e.target.checked })} className="h-5 w-5 accent-[#f43f5e]" />
              {t('throne.forThrone')}
            </label>
          )}
          {form.type === 'HEAD' && form.opponent_id && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={form.forced} onChange={(e) => setForm({ ...form, forced: e.target.checked })} className="mt-1 h-5 w-5 accent-[#f43f5e]" />
              <span>{t('battle.force')} <span className="opacity-70">({t('battle.forceDesc')})</span></span>
            </label>
          )}
          <button disabled={busy} className="btn-cta h-12">{busy ? t('battle.issuing') : t('battle.send')}</button>
        </form>
      )}

      {tab === 'open' && (
        <div className="mt-3 flex flex-col gap-2">
          {openBattles.length === 0 && <p className="card text-sm opacity-70">{t('battle.emptyOpen')}</p>}
          {openBattles.map((ch) => (
            <article key={ch.id} className="card p-3 text-sm">
              <div className="flex items-center gap-2">
                <Avatar path={ch.challenger?.avatar_url} name={nameOf(ch.challenger, '?')} className="h-9 w-9 text-sm" />
                <div className="flex-1">
                  <p className="font-bold">{nameOf(ch.challenger, '?')}</p>
                  <p className="text-xs opacity-70">{t('battle.tFRIENDLY')} • {ch.stakes}</p>
                </div>
                {ch.challenger_id === me?.id ? (
                  <OwnCallControls ch={ch} />
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => run(() => acceptOpenBattle(ch, me!.id), t('battle.taken'))}
                    className="btn-cta h-10 px-4 text-xs"
                  >
                    {t('battle.takeFight')}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'incoming' && (
        <div className="mt-3 flex flex-col gap-2">
          {openBattles.length > 0 && (
            <>
              <h2 className="card-title">{t('battle.openMat')}</h2>
              {openBattles.map((ch) => (
                <article key={`in-${ch.id}`} className="card border-accent-500/40 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Avatar path={ch.challenger?.avatar_url} name={nameOf(ch.challenger, '?')} className="h-9 w-9 text-sm" />
                    <div className="flex-1">
                      <p className="font-bold">{nameOf(ch.challenger, '?')}</p>
                      <p className="text-xs opacity-70">{t('battle.tFRIENDLY')} • {ch.stakes}</p>
                    </div>
                    {ch.challenger_id === me?.id ? (
                      <OwnCallControls ch={ch} />
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => run(() => acceptOpenBattle(ch, me!.id), t('battle.taken'))}
                        className="btn-cta h-10 px-4 text-xs"
                      >
                        {t('battle.takeFight')}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </>
          )}
          {incoming.length === 0 && openBattles.length === 0 && <EmptyState icon={<Icon name="swords" className="h-8 w-8" />} title={t('battle.incoming')} hint={t('battle.emptyIn')} />}
          {incoming.map((ch, i) => <FadeIn key={ch.id} delay={Math.min(i * 60, 360)}><BattleCard ch={ch} incoming /></FadeIn>)}
        </div>
      )}

      {tab === 'squads' && <SquadsTab />}

      {tab === 'history' && (
        <div className="mt-3 flex flex-col gap-2">
          {outgoing.length > 0 && (
            <>
              <h2 className="card-title">{t('battle.openTitle')}</h2>
              {outgoing.map((ch) => <BattleCard key={ch.id} ch={ch} incoming={false} />)}
            </>
          )}
          {history.length === 0 && outgoing.length === 0 && <EmptyState icon={<Icon name="scroll" className="h-8 w-8" />} title={t('battle.history')} hint={t('battle.emptyHist')} />}
          {history.map((ch, i) => <FadeIn key={ch.id} delay={Math.min(i * 60, 360)}><BattleCard ch={ch} incoming={false} /></FadeIn>)}
        </div>
      )}

      {tab === 'commands' && (
        <div className="mt-3 flex flex-col gap-2">
          <label className="label">{t('battle.cmdName')}
            <input value={rivalName} onChange={(e) => setRivalName(e.target.value)} className="input text-sm" placeholder="…" />
          </label>
          {COMMANDS.map((c) => (
            <article key={c.title} className="card p-3 text-sm">
              <p className="font-display text-sm tracking-wide text-accent-400">{t(c.title)}</p>
              <p className="text-xs opacity-60">{t(c.sub)}</p>
              <p className="mt-1 italic">“{t(c.text, { name: rivalName.trim() || 'Rival' })}”</p>
              <div className="mt-2">
                <CopyButton text={t(c.text, { name: rivalName.trim() || 'Rival' })} label={t('battle.cmdCopy')} />
              </div>
            </article>
          ))}
        </div>
      )}
      <BottomNav />
    </main>
  );
}
