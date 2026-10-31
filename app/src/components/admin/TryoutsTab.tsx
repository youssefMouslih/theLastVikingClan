import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLocale } from '../../i18n/LocaleContext';
import { listTryouts, resolveTryout, assignTester, acceptWithAccount, AuthSessionError } from '../../services/tryoutService';
import { listActiveMembers } from '../../services/playerService';
import type { TryoutStatus } from '../../types/database';
import { useAuthStore } from '../../stores/authStore';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import CopyButton from '../ui/CopyButton';

// Admin tryout queue: pending requests first, each with a WhatsApp contact
// button, tester assignment, verdict review, then accept/decline. Accepting a
// tryout provisions the account (or links the existing one) and emails a
// one-time set-password invite or login link.
export default function TryoutsTab() {
  const { t , tError} = useLocale();
  const [params] = useSearchParams();
  const requestId = params.get('request');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const logout = useAuthStore((s) => s.logout);
  const [prov, setProv] = useState<{
    name: string;
    username: string;
    email: string;
    sent: boolean;
    link: string;
    contact: string;
    existing: boolean;
    resolved: boolean;
    emailError?: string | null;
    quota: boolean;
    statusError?: string | null;
  } | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ['tryouts'], queryFn: listTryouts });
  const membersQuery = useQuery({ queryKey: ['tryout-testers'], queryFn: listActiveMembers });
  const names = Object.fromEntries((membersQuery.data ?? []).map((m) => [m.id, m.display_name ?? m.username]));

  useEffect(() => {
    if (!requestId || !query.data) return;
    document.getElementById(`tryout-request-${requestId}`)?.scrollIntoView({ block: 'center' });
  }, [query.data, requestId]);

  async function accept(r: (typeof rows)[number]) {
    setBusyId(r.id); setMsg(null); setProv(null);
    try {
      if (r.email) {
        const created = await acceptWithAccount(r.id);
        setProv({
          name: r.name,
          username: created.username,
          email: created.email,
          sent: created.email_sent,
          link: created.invite_link,
          contact: r.contact,
          existing: !!created.existing,
          resolved: created.resolved !== false,
          emailError: created.email_error ?? null,
          quota: !!created.email_quota_reached,
          statusError: created.status_error ?? null,
        });
      } else {
        await resolveTryout(r.id, 'ACCEPTED');
      }
      await query.refetch();
    } catch (err) {
      setMsg(tError(err));
      // Dead session: clear the stale profile so the router sends us to /login.
      if (err instanceof AuthSessionError) void logout();
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(id: string, status: TryoutStatus) {
    setBusyId(id); setMsg(null);
    try {
      await resolveTryout(id, status);
      await query.refetch();
    } catch (err) {
      setMsg(tError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (query.isLoading) return <p className="mt-3 text-sm">{t('common.loading')}</p>;
  const rows = query.data ?? [];
  const pending = rows.filter((r) => r.status === 'PENDING');
  const done = rows.filter((r) => r.status !== 'PENDING');

  async function assign(id: string) {
    const testerId = picks[id];
    if (!testerId) return;
    setBusyId(id); setMsg(null);
    try {
      await assignTester(id, testerId);
      await query.refetch();
    } catch (err) {
      setMsg(tError(err));
    } finally {
      setBusyId(null);
    }
  }

  const card = (r: (typeof rows)[number]) => {
    const digits = r.contact.replace(/[^\d]/g, '');
    const stColor = r.status === 'PENDING' ? 'text-amber-400' : r.status === 'ACCEPTED' ? 'text-green-400' : 'text-zinc-400';
    const stLabel = r.status === 'PENDING' ? t('tryout.stPending') : r.status === 'ACCEPTED' ? t('tryout.stAccepted') : t('tryout.stDeclined');
    const testerName = r.assigned_tester_id ? (names[r.assigned_tester_id] ?? '…') : null;
    return (
      <div id={`tryout-request-${r.id}`} key={r.id} className="card flex scroll-mt-4 flex-col gap-1.5 p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate font-bold">{r.name}</span>
          <span className={`text-xs font-bold ${stColor}`}>{stLabel}</span>
        </div>
        {r.note && <p className="whitespace-pre-line text-sm opacity-80">{r.note}</p>}
        {r.email && <p className="text-xs opacity-60" dir="ltr">{r.email}</p>}
        <p className="text-xs opacity-60" dir="ltr">{r.contact}</p>
        <p className="text-xs opacity-80">
          {t('tryout.tester')}: {testerName ? <b>{testerName}</b> : <span className="opacity-60">{t('tryout.noTester')}</span>}
        </p>
        {r.verdict && (
          <p className={`rounded-lg p-2 text-xs font-bold ${r.verdict === 'PASS' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {t('tryout.verdictBy')}: {r.verdict === 'PASS' ? t('tryout.verdictPass') : t('tryout.verdictFail')}
            {r.verdict_score_a != null && r.verdict_score_b != null ? ` ${r.verdict_score_a}–${r.verdict_score_b}` : ''}
            {r.verdict_note ? ` — ${r.verdict_note}` : ''}
          </p>
        )}
        {r.status === 'PENDING' && (
          <div className="flex gap-2">
            <select
              value={picks[r.id] ?? r.assigned_tester_id ?? ''}
              onChange={(e) => setPicks({ ...picks, [r.id]: e.target.value })}
              aria-label={t('tryout.assignTester')}
              className="input h-10 flex-1 text-sm"
            >
              <option value="">{t('tryout.assignTester')}…</option>
              {(membersQuery.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.display_name ?? m.username}</option>
              ))}
            </select>
            <button
              disabled={busyId === r.id || (picks[r.id] ?? r.assigned_tester_id ?? '') === (r.assigned_tester_id ?? '')}
              onClick={() => assign(r.id)}
              className="btn-ghost h-10 shrink-0 px-3 text-xs"
            >
              OK
            </button>
          </div>
        )}
        <div className="mt-1 flex gap-2">
          {digits && (
            <a
              href={`https://wa.me/${digits}?text=${encodeURIComponent(`Salam ${r.name} — VIK Clan`)}`}
              target="_blank" rel="noreferrer"
              className="flex h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-[#25d366] px-3 text-xs font-bold text-white"
            >
              <WhatsAppIcon className="h-5 w-5" /> {t('tryout.chat')}
            </a>
          )}
          {r.status === 'PENDING' && (
            <>
              <button disabled={busyId === r.id} onClick={() => accept(r)} className="btn-primary h-10 flex-1 text-xs" title={r.email ? t('tryout.invitedHint') : undefined}>
                {t('tryout.accept')}
              </button>
              <button disabled={busyId === r.id} onClick={() => resolve(r.id, 'DECLINED')} className="btn-ghost h-10 flex-1 text-xs">
                {t('tryout.decline')}
              </button>
            </>
          )}
          {r.status === 'ACCEPTED' && r.email && (
            <button
              disabled={busyId === r.id}
              onClick={() => accept(r)}
              className="btn-ghost h-10 flex-1 text-xs"
              title={t('tryout.resendHint')}
            >
              {t('tryout.resendLink')}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      {msg && <p className="text-sm font-medium">{msg}</p>}
      {prov && (
        <div className="card border-brand-500/50 p-3 text-sm">
          <p className="font-bold">
            {prov.existing
              ? t('tryout.existingAccount', { username: prov.username })
              : t('tryout.accountCreated', { username: prov.username })}
          </p>
          <p className={`mt-1 text-xs font-semibold ${prov.sent ? 'text-green-400' : 'text-amber-400'}`}>
            {prov.sent
              ? (prov.existing
                ? t('tryout.magicSent', { email: prov.email })
                : t('tryout.inviteSent', { email: prov.email }))
              : (prov.existing ? t('tryout.magicFailed') : t('tryout.inviteFailed'))}
          </p>
          {prov.quota && (
            <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs font-semibold text-amber-400">
              {t('tryout.quotaReached')}
            </p>
          )}
          {!prov.sent && prov.emailError && !prov.quota && (
            <p className="mt-1 break-words text-[11px] opacity-60">{prov.emailError}</p>
          )}
          {!prov.resolved && (
            <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs font-semibold text-amber-400">
              {t('tryout.resolveFailed')}
              {prov.statusError && <span className="mt-1 block break-words font-normal opacity-70">{prov.statusError}</span>}
            </p>
          )}
          {prov.link && (
            <>
              {!prov.sent && !prov.quota && (
                <p className="mt-1 text-xs opacity-70">
                  {prov.existing ? t('tryout.magicLinkHint') : t('tryout.inviteLinkHint')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton
                  text={prov.link}
                  label={prov.quota
                    ? t('tryout.copyForWhatsApp')
                    : (prov.existing ? t('tryout.copyMagicLink') : t('tryout.copyInviteLink'))}
                />
                {prov.contact.replace(/[^\d]/g, '') && (
                  <a
                    href={`https://wa.me/${prov.contact.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
                      prov.existing
                        ? t('tryout.waMagic', { name: prov.name, link: prov.link })
                        : t('tryout.waInvite', { name: prov.name, link: prov.link }),
                    )}`}
                    target="_blank" rel="noreferrer"
                    className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-[#25d366] px-3 text-xs font-bold text-white"
                  >
                    <WhatsAppIcon className="h-5 w-5" /> {prov.quota ? t('tryout.waSend') : t('tryout.chat')}
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {rows.length === 0 && <p className="card text-sm opacity-70">{t('tryout.empty')}</p>}
      {pending.map(card)}
      {pending.length > 0 && done.length > 0 && <div aria-hidden className="my-1 h-px bg-white/10" />}
      {done.map(card)}
    </div>
  );
}
