import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLocale } from '../i18n/LocaleContext';
import { useOath } from '../hooks/useOath';
import Avatar from '../components/ui/Avatar';
import { getCompetitionByCode, joinCompetition, joinWaitlist, listParticipants } from '../services/competitionService';
import { useAuthStore } from '../stores/authStore';

// Join through link (§23): /join/VIK7X92
export default function JoinPage() {
  const { t, fmtDate } = useLocale();
  const { sworn, swear } = useOath();
  const { code } = useParams();
  const me = useAuthStore((s) => s.profile);
  const nav = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swearing, setSwearing] = useState(false);

  const query = useQuery({ queryKey: ['join', code], queryFn: () => getCompetitionByCode(code ?? ''), enabled: !!code });
  const partsQuery = useQuery({
    queryKey: ['join-count', query.data?.id],
    enabled: !!query.data,
    queryFn: () => listParticipants(query.data!.id),
  });
  const comp = query.data;
  const count = partsQuery.data?.length ?? 0;
  const isFull = comp ? count >= comp.max_players : false;

  async function join() {
    if (!comp || !me) return;
    setBusy(true); setMsg(null);
    try {
      await joinCompetition(comp, me.id);
      nav(`/competitions/${comp.id}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Join failed.');
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading) return <main className="page text-sm">{t('join.loading')}</main>;
  if (!comp) return <main className="mx-auto max-w-sm p-4 text-center"><p className="text-lg font-bold">{t('join.invalid')}</p><p className="text-sm opacity-70">{t('join.invalidDesc')}</p><Link to="/competitions" className="text-sm underline">{t('join.browse')}</Link></main>;

  return (
    <main className="mx-auto max-w-sm p-4 pb-24 text-center">
      <div className="font-display mt-8 bg-gradient-to-b from-brand-400 to-brand-700 bg-clip-text text-5xl text-transparent">VIK</div>
      <h1 className="font-display mt-2 text-2xl tracking-wide">{comp.name}</h1>
      <p className="text-sm opacity-70">{comp.type} • {t('join.capacity', { max: comp.max_players })}</p>
      <p className="mt-1 text-sm">{t('join.regCloses', { date: comp.registration_deadline ? fmtDate(comp.registration_deadline) : '—' })}</p>
      <p className="mt-1 font-semibold">{t('join.current', { count, max: comp.max_players })}{isFull ? t('join.fullSuffix') : ''}</p>
      {(partsQuery.data ?? []).length > 0 && (
        <div className="mt-2 flex items-center justify-center gap-1">
          <div className="flex -space-x-2">
            {(partsQuery.data ?? []).slice(0, 10).map((p) => (
              <Avatar key={p.player_id} path={p.player?.avatar_url} name={p.player?.display_name ?? p.player?.username ?? '?'} className="h-8 w-8 border-2 border-[var(--surface)] text-xs" />
            ))}
          </div>
        </div>
      )}
      {msg && <p role="alert" className="mt-2 text-sm font-medium">{msg}</p>}
      {!sworn ? (
        <div className="card mt-4 text-sm">
          <p className="font-bold">{t('code.oathGate')}</p>
          <div className="mt-2 flex gap-2">
            <Link to="/code" className="btn-ghost flex-1">{t('code.tabOath')}</Link>
            <button
              disabled={swearing}
              onClick={async () => { setSwearing(true); try { await swear(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); } finally { setSwearing(false); } }}
              className="btn-cta flex-1"
            >
              {t('code.oathSwear')}
            </button>
          </div>
        </div>
      ) : isFull ? (
        <button onClick={async () => { setBusy(true); try { await joinWaitlist(comp.id, me!.id); setMsg(t('detail.waitlistAdded')); } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed.'); } finally { setBusy(false); } }} disabled={busy} className="btn-primary mt-4 w-full">
          {busy ? t('join.joining') : t('join.waitlist')}
        </button>
      ) : (
        <button onClick={join} disabled={busy} className="btn-primary mt-4 w-full">
          {busy ? t('join.joining') : t('join.join')}
        </button>
      )}
    </main>
  );
}
