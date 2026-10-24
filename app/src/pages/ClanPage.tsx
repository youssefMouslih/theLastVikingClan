import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import MemberRow from '../components/player/MemberRow';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { FadeIn, SkeletonList } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { getClanSettings, updateClanSettings } from '../services/clanService';
import { listCompetitions } from '../services/competitionService';
import { listMembers } from '../services/playerService';
import { getClanTotals, getHallOfFame } from '../services/statisticsService';
import { useAuthStore } from '../stores/authStore';
import Pagination, { PAGE_SIZE } from '../components/ui/Pagination';

export default function ClanPage() {
  const { t , tError} = useLocale();
  const me = useAuthStore((s) => s.profile);
  const canEdit = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', tag: '', description: '', rules: '', quest_names: 'classic' as 'classic' | 'norse' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  const clanQuery = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const membersQuery = useQuery({ queryKey: ['members'], queryFn: listMembers });
  const totalsQuery = useQuery({ queryKey: ['clan-totals'], queryFn: getClanTotals });
  const fameQuery = useQuery({ queryKey: ['hall-of-fame'], queryFn: getHallOfFame });
  const pastQuery = useQuery({ queryKey: ['past-seasons'], queryFn: () => listCompetitions() });
  const past = (pastQuery.data ?? []).filter((c) => c.status === 'FINISHED' || c.status === 'ARCHIVED');

  const clan = clanQuery.data;
  const members = membersQuery.data ?? [];
  const activeCount = members.filter((m) => m.status === 'ACTIVE').length;
  const pageCount = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = members.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function startEdit() {
    setForm({
      name: clan?.name ?? '',
      tag: clan?.tag ?? '',
      description: clan?.description ?? '',
      rules: clan?.rules ?? '',
      quest_names: clan?.quest_names ?? 'classic',
    });
    setSaveError(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      await updateClanSettings({ name: form.name.trim() || 'VIK', tag: form.tag.trim() || null, description: form.description || null, rules: form.rules || null, quest_names: form.quest_names });
      await clanQuery.refetch();
      setEditing(false);
    } catch (err) {
      setSaveError(tError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page max-w-5xl">
      {clanQuery.isLoading && !clan ? (
        <div aria-busy="true" className="card">
          <p role="status" className="text-sm">{t('clan.loading')}</p>
          <div className="mt-4 flex flex-col gap-2">
            <div className="h-4 w-2/5 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      ) : clanQuery.isError && !clan ? (
        <section className="card flex flex-wrap items-center justify-between gap-3" aria-labelledby="clan-load-error-title">
          <div>
            <h1 id="clan-load-error-title" className="font-display text-xl">{t('nav.clan')}</h1>
            <p role="alert" className="mt-1 text-sm text-red-400">{t('clan.loadError')} {tError(clanQuery.error)}</p>
          </div>
          <button type="button" onClick={() => void clanQuery.refetch()} className="btn-ghost gap-2 text-sm">
            <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
          </button>
        </section>
      ) : (
        <header className="card overflow-hidden p-0!">
          <div
            className={`relative min-h-36 overflow-hidden border-b border-(--border) ${clan?.banner_url ? '' : 'efoot-banner'}`}
          >
            {clan?.banner_url && (
              <>
                <img src={clan.banner_url} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
                <div aria-hidden className="absolute inset-0 bg-linear-to-r from-black/90 via-black/55 to-black/20" />
              </>
            )}
            <div aria-hidden className="absolute inset-y-0 inset-e-0 w-1/3 border-s border-white/10 opacity-50" />
            <div className="relative flex min-h-36 flex-wrap items-end justify-between gap-4 p-4 sm:p-6">
              <div className="flex min-w-0 items-center gap-4">
                {clan?.logo_url ? (
                  <img src={clan.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-white/20 object-cover shadow-lg" />
                ) : (
                  <img src="/logo.png" alt="" className="h-16 w-16 shrink-0 rounded-xl border border-white/20 object-cover shadow-lg" />
                )}
                {clanQuery.isError && clan && (
                  <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--border) bg-(--surface) p-3 text-sm">
                    <span>{t('clan.loadError')} {tError(clanQuery.error)}</span>
                    <button type="button" onClick={() => void clanQuery.refetch()} className="btn-ghost gap-2 text-xs">
                      <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
                    </button>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-brand-300">{t('nav.clan')}</p>
                  <h1 className="font-display truncate text-2xl tracking-wide text-white sm:text-3xl">{clan?.name ?? 'VIK Clan'}</h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
                    {clan?.tag && <span className="font-bold text-brand-300">[{clan.tag}]</span>}
                    {membersQuery.isSuccess && <span>{t('clan.activeMembers', { n: activeCount })}</span>}
                    {clan?.country && <span>{clan.country}</span>}
                    {clan?.timezone && <span>{clan.timezone}</span>}
                  </div>
                </div>
              </div>
              {canEdit && !editing && (
                <button type="button" onClick={startEdit} className="btn-ghost gap-2 border-white/30 bg-black/20 text-sm text-white hover:bg-black/40">
                  <Icon name="pencil" className="h-4 w-4" /> {t('clan.edit')}
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-(--text)">
              {clan?.description || t('clan.activeMembers', { n: activeCount })}
            </p>
            <Link to="/gallery" className="btn-ghost shrink-0 gap-2 text-sm">
              <Icon name="scroll" className="h-4 w-4" /> {t('gallery.title')}
            </Link>
          </div>
        </header>
      )}

      {editing && (
        <form onSubmit={save} className="card mt-4 flex flex-col gap-3" aria-labelledby="clan-edit-title">
          <div className="border-b border-(--border) pb-3">
            <h2 id="clan-edit-title" className="font-display text-lg tracking-wide">{t('clan.edit')} {t('nav.clan')}</h2>
          </div>
          <label className="label">{t('clan.name')}<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="label">{t('clan.tag')}<input className="input" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="VIK" /></label>
          <label className="label">{t('clan.description')}<textarea className="input h-auto py-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="label">{t('clan.rules')}<textarea className="input h-auto py-2" rows={4} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} placeholder={t('clan.rulesPlaceholder')} /></label>
          <label className="label">{t('clan.questNames')}
            <select value={form.quest_names} onChange={(e) => setForm({ ...form, quest_names: e.target.value as 'classic' | 'norse' })} className="input">
              <option value="classic">{t('clan.questClassic')}</option>
              <option value="norse">{t('clan.questNorse')}</option>
            </select>
          </label>
          {saveError && <p role="alert" className="text-sm text-red-500">{saveError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary h-11 flex-1">{saving ? t('clan.saving') : t('clan.save')}</button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost h-11 px-4">{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {clan?.rules && !editing && (
        <section aria-labelledby="clan-rules-title" className="card mt-4">
          <h2 id="clan-rules-title" className="card-title flex items-center gap-2"><Icon name="scroll" className="h-4 w-4 text-brand-400" /> {t('clan.rulesTitle')}</h2>
          <p className="mt-1 whitespace-pre-line text-sm">{clan.rules}</p>
        </section>
      )}

      <section aria-labelledby="clan-members-title" className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-(--border) pb-3">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-brand-400">{t('nav.clan')}</p>
            <h2 id="clan-members-title" className="font-display text-xl tracking-wide">{t('clan.members', { n: members.length })}</h2>
          </div>
          {!membersQuery.isLoading && !membersQuery.isError && members.length > 0 && (
            <p className="text-xs text-(--muted)">{t('clan.activeMembers', { n: activeCount })}</p>
          )}
        </div>
        {membersQuery.isLoading ? (
          <div aria-busy="true" aria-label={t('common.loading')}><SkeletonList rows={5} /></div>
        ) : membersQuery.isError && members.length === 0 ? (
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p role="alert" className="text-sm text-red-400">{t('clan.membersError')} {tError(membersQuery.error)}</p>
            <button type="button" onClick={() => void membersQuery.refetch()} className="btn-ghost gap-2 text-sm">
              <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
            </button>
          </div>
        ) : members.length === 0 ? (
          <p className="card text-sm text-(--muted)">{t('clan.noMembers')}</p>
        ) : (
          <>
            {membersQuery.isError && (
              <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--border) bg-(--surface) p-3 text-sm">
                <span>{t('clan.membersError')} {tError(membersQuery.error)}</span>
                <button type="button" onClick={() => void membersQuery.refetch()} className="btn-ghost gap-2 text-xs">
                  <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
                </button>
              </div>
            )}
            {membersQuery.isFetching && !membersQuery.isError && (
              <p role="status" className="mb-2 text-xs text-(--muted)">{t('common.loading')}</p>
            )}
            <div className="flex flex-col gap-2">
              {pageRows.map((m, i) => <FadeIn key={m.id} delay={Math.min(i * 40, 320)}><MemberRow member={m} /></FadeIn>)}
            </div>
            <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
          </>
        )}
      </section>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="clan-stats-title" className="card">
        <h2 id="clan-stats-title" className="card-title flex items-center gap-2"><Icon name="chart" className="h-4 w-4 text-brand-400" /> {t('clan.stats')}</h2>
        {totalsQuery.data ? (
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-(--border) bg-(--border) sm:grid-cols-4">
            {[
              [totalsQuery.data.members, t('clan.stMembers')],
              [totalsQuery.data.matches, t('clan.stMatches')],
              [totalsQuery.data.goals, t('clan.stGoals')],
              [totalsQuery.data.seasons, t('clan.stSeasons')],
            ].map(([value, label]) => (
              <div key={label} className="bg-(--surface-2) p-3 text-center">
                <div className="font-display text-2xl tabular-nums text-brand-300">{value}</div>
                <div className="mt-1 text-xs text-(--muted)">{label}</div>
              </div>
            ))}
          </div>
        ) : totalsQuery.isError ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p role="alert" className="text-sm text-red-400">{tError(totalsQuery.error)}</p>
            <button type="button" onClick={() => void totalsQuery.refetch()} className="btn-ghost gap-2 text-xs">
              <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
            </button>
          </div>
        ) : (
          <p role="status" className="mt-3 text-sm text-(--muted)">{t('clan.fameLoading')}</p>
        )}
      </section>

      <section aria-labelledby="clan-fame-title" className="card">
        <h2 id="clan-fame-title" className="card-title flex items-center gap-2"><Icon name="medal" className="h-4 w-4 text-brand-400" /> {t('clan.fame')}</h2>
        {fameQuery.isLoading ? (
          <p role="status" className="mt-3 text-sm text-(--muted)">{t('clan.fameLoading')}</p>
        ) : fameQuery.isError ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p role="alert" className="text-sm text-red-400">{tError(fameQuery.error)}</p>
            <button type="button" onClick={() => void fameQuery.refetch()} className="btn-ghost gap-2 text-xs">
              <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
            </button>
          </div>
        ) : (fameQuery.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-(--muted)">{t('clan.fameEmpty')}</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-(--border) text-sm">
            {fameQuery.data!.map((h) => {
              const champ = members.find((x) => x.id === h.championId);
              return <li key={h.competitionId} className="flex items-center gap-2 py-3 first:pt-0 last:pb-0"><Icon name="trophy" className="h-4 w-4 shrink-0 text-brand-400" /><span className="min-w-0 flex-1 truncate">{h.name}</span><span className="shrink-0 font-semibold">{champ ? (champ.display_name ?? champ.username) : '—'}</span></li>;
            })}
          </ul>
        )}
      </section>
      {pastQuery.isLoading ? (
        <section aria-labelledby="clan-past-title" className="card mt-4 lg:col-span-2">
          <h2 id="clan-past-title" className="card-title">{t('clan.pastSeasons')}</h2>
          <p role="status" className="mt-3 text-sm text-(--muted)">{t('clan.fameLoading')}</p>
        </section>
      ) : pastQuery.isError && past.length === 0 ? (
        <section aria-labelledby="clan-past-title" className="card mt-4 lg:col-span-2">
          <h2 id="clan-past-title" className="card-title">{t('clan.pastSeasons')}</h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p role="alert" className="text-sm text-red-400">{tError(pastQuery.error)}</p>
            <button type="button" onClick={() => void pastQuery.refetch()} className="btn-ghost gap-2 text-xs">
              <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
            </button>
          </div>
        </section>
      ) : past.length > 0 ? (
        <section aria-labelledby="clan-past-title" className="card mt-4 lg:col-span-2">
          <h2 id="clan-past-title" className="card-title flex items-center gap-2"><Icon name="calendar" className="h-4 w-4 text-brand-400" /> {t('clan.pastSeasons')}</h2>
          {pastQuery.isError && (
            <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-red-400">
              <span>{tError(pastQuery.error)}</span>
              <button type="button" onClick={() => void pastQuery.refetch()} className="btn-ghost gap-2 text-xs">
                <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
              </button>
            </div>
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            {past.map((c) => (
              <Link key={c.id} to={`/competitions/${c.id}`} className="flex min-h-12 items-center gap-3 rounded-xl border border-(--border) bg-(--surface-2) p-3 text-sm transition-colors hover:border-brand-400/50 hover:bg-white/5 active:scale-[0.99]">
                <Icon name="trophy" className="h-4 w-4 text-brand-400" />
                <span className="flex-1 truncate font-semibold">{c.name}</span>
                <span className="text-xs opacity-60">{c.type}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section aria-labelledby="clan-past-title" className="card mt-4 lg:col-span-2">
          <h2 id="clan-past-title" className="card-title flex items-center gap-2"><Icon name="calendar" className="h-4 w-4 text-brand-400" /> {t('clan.pastSeasons')}</h2>
          <p className="mt-3 text-sm text-(--muted)">{t('clan.fameEmpty')}</p>
        </section>
      )}
      </div>
      <BottomNav />
    </main>
  );
}
