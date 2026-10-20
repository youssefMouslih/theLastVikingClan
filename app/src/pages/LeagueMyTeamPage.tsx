import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import AppBar from '../components/ui/AppBar';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import StatusBadge from '../components/ui/StatusBadge';
import LeagueRoster from '../components/league4v4/LeagueRoster';
import { useLocale } from '../i18n/LocaleContext';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import {
  answerLeagueInvite,
  findMyLeagueTeam,
  inviteLeagueMember,
  leaveLeagueTeam,
  listIncomingLeagueInvites,
  listInvitablePlayers,
  listTeamLeagueInvites,
  removeLeagueTeamMember,
  transferLeagueCaptain,
  updateLeagueTeam,
} from '../services/leagueTeamService';
import { useAuthStore } from '../stores/authStore';

export default function LeagueMyTeamPage() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const me = useAuthStore((state) => state.profile);
  const [name, setName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const season = pickCurrentLeagueSeason(seasonsQuery.data ?? []);
  const teamQuery = useQuery({
    queryKey: leagueKeys.myTeam(season?.id ?? 'none', me?.id ?? 'none'),
    queryFn: () => findMyLeagueTeam(season!.id, me!.id),
    enabled: !!season && !!me,
  });
  const team = teamQuery.data ?? null;
  const isCaptain = !!team && team.captain_id === me?.id;
  const canEditRoster = !!team && season?.status === 'REGISTRATION';
  const incomingQuery = useQuery({
    queryKey: leagueKeys.incomingInvites(me?.id ?? 'none'),
    queryFn: () => listIncomingLeagueInvites(me!.id),
    enabled: !!me,
  });
  const sentQuery = useQuery({
    queryKey: leagueKeys.teamInvites(team?.id ?? 'none'),
    queryFn: () => listTeamLeagueInvites(team!.id),
    enabled: !!team && isCaptain && canEditRoster,
  });
  const invitableQuery = useQuery({
    queryKey: leagueKeys.invitablePlayers(season?.id ?? 'none', team?.id ?? 'none'),
    queryFn: () => listInvitablePlayers(season!.id, team!.id, me?.id),
    enabled: !!season && !!team && isCaptain && canEditRoster,
  });
  const incoming = incomingQuery.data ?? [];
  const sent = sentQuery.data ?? [];
  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (invitableQuery.data ?? []).filter((player) => {
      if (!query) return true;
      return player.username.toLowerCase().includes(query) || (player.display_name ?? '').toLowerCase().includes(query);
    });
  }, [invitableQuery.data, search]);

  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key); setErr(null); setMsg(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(success);
    } catch (error) {
      setErr(error instanceof Error ? error.message : t('league4.actionFailed'));
    } finally {
      setBusy(null);
    }
  }

  function acceptInvite(inviteId: string) {
    void run(`invite-${inviteId}`, () => answerLeagueInvite(inviteId, true), t('league4.inviteAccepted'));
  }
  function declineInvite(inviteId: string) {
    void run(`invite-${inviteId}`, () => answerLeagueInvite(inviteId, false), t('league4.inviteDeclined'));
  }
  function invitePlayer(playerId: string, playerName: string) {
    if (!team) return;
    void run(`invite-player-${playerId}`, () => inviteLeagueMember(team.id, playerId), t('league4.inviteSentTo', { name: playerName }));
  }
  function removeMember(playerId: string, playerName: string) {
    if (!team || !confirm(t('league4.removeConfirm', { name: playerName }))) return;
    void run(`remove-${playerId}`, () => removeLeagueTeamMember(team.id, playerId), t('league4.memberRemoved'));
  }
  function transferCaptain(playerId: string, playerName: string) {
    if (!team || !confirm(t('league4.transferConfirm', { name: playerName }))) return;
    void run(`transfer-${playerId}`, () => transferLeagueCaptain(team.id, playerId), t('league4.captainTransferred'));
  }
  function leaveTeam() {
    if (!team || !confirm(t('league4.leaveConfirm'))) return;
    void run('leave', () => leaveLeagueTeam(team.id), t('league4.leftSquad'));
  }

  if (seasonsQuery.isLoading || teamQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.mySquad')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }
  if (!season) {
    return <main className="page"><AppBar title={t('league4.mySquad')} /><EmptyState icon={<Icon name="trophy" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} /><BottomNav /></main>;
  }

  if (!team) {
    return (
      <main className="page">
        <AppBar title={t('league4.mySquad')} />
        <EmptyState icon={<Icon name="shield" />} title={t('league4.noSquad')} hint={t('league4.noSquadHint')} />
        {incoming.length > 0 ? (
          <section className="card mt-3">
            <h2 className="card-title flex items-center gap-1"><Icon name="bell" className="h-4 w-4 text-accent-400" /> {t('league4.incomingInvites')}</h2>
            <div className="mt-2 flex flex-col gap-2">
              {incoming.map((invite) => (
                <div key={invite.id} className="rounded-xl border border-[var(--border)] p-3">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold">{invite.team?.name ?? '—'}</p>
                    <StatusBadge value={invite.status} />
                  </div>
                  <p className="text-xs opacity-60">{invite.season?.name}</p>
                  {invite.message && <p className="mt-1 text-xs opacity-70">{invite.message}</p>}
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy === `invite-${invite.id}`} onClick={() => acceptInvite(invite.id)} className="btn-primary h-10 flex-1 text-sm">{t('league4.accept')}</button>
                    <button type="button" disabled={busy === `invite-${invite.id}`} onClick={() => declineInvite(invite.id)} className="btn-ghost h-10 flex-1 text-sm">{t('league4.decline')}</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="mt-3 text-sm opacity-60">{t('league4.noInvites')}</p>
        )}
        {err && <p role="alert" className="mt-2 text-sm text-red-400">{err}</p>}
        {msg && <p className="mt-2 text-sm text-brand-400">{msg}</p>}
        {season.status === 'REGISTRATION' ? (
          <Link to="/4vs4/teams/create" className="btn-primary mt-3 h-11 w-full">{t('league4.createSquad')}</Link>
        ) : (
          <Link to="/4vs4/teams" className="btn-ghost mt-3 h-11 w-full">{t('league4.browseSquads')}</Link>
        )}
        <BottomNav />
      </main>
    );
  }

  const squadName = name ?? team.name;

  return (
    <main className="page">
      <AppBar title={t('league4.mySquad')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">{season.name}</p>
        <StatusBadge value={season.status} />
      </div>

      <section className="hero hero-glow mt-3">
        <div className="flex items-center gap-2">
          <Link to={`/4vs4/teams/${team.id}`} className="font-display min-w-0 flex-1 truncate text-2xl tracking-wide">{team.name}</Link>
          <StatusBadge value={team.status} />
        </div>
        <p className="mt-1 text-xs opacity-60">{t('league4.playersCount', { n: team.member_count })} · {t('league4.captain')}: {team.captain_profile?.display_name ?? team.captain_profile?.username ?? '—'}</p>
        {team.status === 'PENDING' && <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.awaitingApprovalHint')}</p>}
        {!canEditRoster && <p className="mt-2 rounded-lg border border-[var(--border)] p-2 text-xs opacity-70">{t('league4.rosterLocked')}</p>}
      </section>

      {err && <p role="alert" className="mt-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-2 text-sm text-brand-400">{msg}</p>}

      {isCaptain && canEditRoster && (
        <form
          className="card mt-3 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (squadName.trim().length >= 2) void run('rename', () => updateLeagueTeam(team.id, squadName), t('league4.squadRenamed'));
          }}
        >
          <h2 className="card-title">{t('league4.renameSquad')}</h2>
          <input required minLength={2} maxLength={40} value={squadName} onChange={(event) => setName(event.target.value)} className="input text-sm" />
          <button type="submit" disabled={busy === 'rename' || squadName.trim().length < 2} className="btn-primary h-10 text-sm">{t('league4.saveName')}</button>
        </form>
      )}

      <section className="card mt-3">
        <h2 className="card-title flex items-center gap-1"><Icon name="users" className="h-4 w-4 text-brand-400" /> {t('league4.roster')}</h2>
        <div className="mt-2">
          <LeagueRoster
            members={team.members}
            captainId={team.captain_id}
            currentPlayerId={me?.id}
            canManage={isCaptain && canEditRoster}
            busy={busy !== null}
            onRemove={(member) => removeMember(member.player_id, member.player?.display_name ?? member.player?.username ?? '?')}
            onTransfer={(member) => transferCaptain(member.player_id, member.player?.display_name ?? member.player?.username ?? '?')}
          />
        </div>
        {(!isCaptain || team.member_count === 1) && canEditRoster && (
          <button type="button" disabled={busy === 'leave'} onClick={leaveTeam} className="btn-danger mt-3 h-10 w-full text-sm">{t('league4.leaveSquad')}</button>
        )}
        {isCaptain && team.member_count > 1 && canEditRoster && <p className="mt-2 text-xs opacity-60">{t('league4.captainLeaveHint')}</p>}
      </section>

      {isCaptain && canEditRoster && (
        <section className="card mt-3">
          <h2 className="card-title flex items-center gap-1"><Icon name="plus" className="h-4 w-4 text-brand-400" /> {t('league4.invitePlayers')}</h2>
          <p className="mt-1 text-xs opacity-60">{t('league4.invitePlayersHint', { min: season.roster_min, max: season.roster_max })}</p>
          <div className="relative mt-2">
            <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input h-10 ps-9 text-sm" placeholder={t('league4.searchPlayers')} />
          </div>
          <div className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {candidates.map((player) => {
              const playerName = player.display_name ?? player.username;
              return (
                <div key={player.id} className="flex items-center gap-2 rounded-lg p-1.5">
                  <Avatar path={player.avatar_url} name={playerName} className="h-9 w-9 text-sm" zoomable={false} />
                  <span className="min-w-0 flex-1 truncate text-sm">{playerName}</span>
                  <button type="button" disabled={busy === `invite-player-${player.id}`} onClick={() => invitePlayer(player.id, playerName)} className="btn-ghost h-9 px-3 text-xs">{t('league4.invite')}</button>
                </div>
              );
            })}
            {candidates.length === 0 && <p className="py-3 text-center text-xs opacity-60">{t('league4.noEligiblePlayers')}</p>}
          </div>
          {sent.length > 0 && (
            <div className="mt-3 border-t border-[var(--border)] pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wide opacity-60">{t('league4.invitesSent')}</h3>
              <ul className="mt-1 flex flex-col gap-1">
                {sent.map((invite) => (
                  <li key={invite.id} className="flex items-center gap-2 text-sm">
                    <Icon name="clock" className="h-3.5 w-3.5 opacity-50" />
                    <span className="min-w-0 flex-1 truncate">{invite.player?.display_name ?? invite.player?.username ?? invite.player_id.slice(0, 8)}</span>
                    <span className="text-xs opacity-60">{t('league4.pending')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {incoming.length > 0 && (
        <section className="card mt-3">
          <h2 className="card-title flex items-center gap-1"><Icon name="bell" className="h-4 w-4 text-accent-400" /> {t('league4.incomingInvites')}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {incoming.map((invite) => (
              <div key={invite.id} className="rounded-xl border border-[var(--border)] p-2">
                <p className="truncate text-sm font-semibold">{invite.team?.name ?? '—'}</p>
                <div className="mt-1 flex gap-2">
                  <button type="button" disabled={busy === `invite-${invite.id}`} onClick={() => acceptInvite(invite.id)} className="btn-primary h-9 flex-1 text-xs">{t('league4.accept')}</button>
                  <button type="button" disabled={busy === `invite-${invite.id}`} onClick={() => declineInvite(invite.id)} className="btn-ghost h-9 flex-1 text-xs">{t('league4.decline')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <BottomNav />
    </main>
  );
}
