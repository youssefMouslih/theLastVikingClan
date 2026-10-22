import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import AppBar from '../components/ui/AppBar';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import CopyButton from '../components/ui/CopyButton';
import Icon from '../components/ui/Icon';
import QueryError from '../components/ui/QueryError';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import StatusBadge from '../components/ui/StatusBadge';
import LeagueRoster from '../components/league4v4/LeagueRoster';
import TeamLogo from '../components/league4v4/TeamLogo';
import { useLocale } from '../i18n/LocaleContext';
import { confirmDialog } from '../components/ui/confirm';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import {
  answerLeagueInvite,
  clearLeagueTeamLogo,
  findMyLeagueTeam,
  inviteLeagueMember,
  leaveLeagueTeam,
  listIncomingLeagueInvites,
  listLeagueInviteCandidates,
  listTeamLeagueInvites,
  removeLeagueTeamMember,
  revokeLeagueInvite,
  saveLeagueTeamLogo,
  setLeagueTeamBio,
  transferLeagueCaptain,
  updateLeagueTeam,
} from '../services/leagueTeamService';
import { useAuthStore } from '../stores/authStore';

export default function LeagueMyTeamPage() {
  const { t , tError} = useLocale();
  const queryClient = useQueryClient();
  const me = useAuthStore((state) => state.profile);
  const [name, setName] = useState<string | null>(null);
  const [bioDraft, setBioDraft] = useState<string | null>(null);
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
  const canEditProfile = !!team && isCaptain
    && (season?.status === 'REGISTRATION' || season?.status === 'ACTIVE')
    && (team.status === 'PENDING' || team.status === 'APPROVED');
  const logoStatusLocked = !!team && isCaptain
    && (season?.status === 'REGISTRATION' || season?.status === 'ACTIVE')
    && team.status !== 'PENDING' && team.status !== 'APPROVED';
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
  const candidatesQuery = useQuery({
    queryKey: leagueKeys.inviteCandidates(season?.id ?? 'none', team?.id ?? 'none'),
    queryFn: () => listLeagueInviteCandidates(season!.id, team!.id, me?.id),
    enabled: !!season && !!team && isCaptain && canEditRoster,
  });
  const incoming = incomingQuery.data ?? [];
  const sent = sentQuery.data ?? [];
  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (candidatesQuery.data ?? []).filter((player) => {
      if (!query) return true;
      return player.username.toLowerCase().includes(query) || (player.display_name ?? '').toLowerCase().includes(query);
    });
  }, [candidatesQuery.data, search]);

  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key); setErr(null); setMsg(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(success);
    } catch (error) {
      setErr(tError(error));
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

  async function undoInvite(inviteId: string, playerName: string) {
    if (!(await confirmDialog({ message: t('league4.undoInviteConfirm', { name: playerName }) }))) return;
    void run(`revoke-invite-${inviteId}`, () => revokeLeagueInvite(inviteId), t('league4.inviteRevoked'));
  }
  async function removeMember(playerId: string, playerName: string) {
    if (!team || !(await confirmDialog({ message: t('league4.removeConfirm', { name: playerName }), danger: true }))) return;
    void run(`remove-${playerId}`, () => removeLeagueTeamMember(team.id, playerId), t('league4.memberRemoved'));
  }
  async function transferCaptain(playerId: string, playerName: string) {
    if (!team || !(await confirmDialog({ message: t('league4.transferConfirm', { name: playerName }), danger: true }))) return;
    void run(`transfer-${playerId}`, () => transferLeagueCaptain(team.id, playerId), t('league4.captainTransferred'));
  }
  async function leaveTeam() {
    if (!team || !(await confirmDialog({ message: t('league4.leaveConfirm'), danger: true }))) return;
    void run('leave', () => leaveLeagueTeam(team.id), t('league4.leftSquad'));
  }
  function uploadLogo(file: File) {
    if (!team) return;
    void run('logo', async () => { await saveLeagueTeamLogo(team.id, file, team.logo_path); }, t('league4.logoUpdated'));
  }
  function removeLogo() {
    if (!team) return;
    void run('logo', () => clearLeagueTeamLogo(team.id, team.logo_path), t('league4.logoRemoved'));
  }

  if (seasonsQuery.isLoading || teamQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.mySquad')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }
  if (seasonsQuery.isError) {
    return <main className="page"><AppBar title={t('league4.mySquad')} /><QueryError error={seasonsQuery.error} onRetry={() => void seasonsQuery.refetch()} /><BottomNav /></main>;
  }
  if (teamQuery.isError) {
    return <main className="page"><AppBar title={t('league4.mySquad')} /><QueryError error={teamQuery.error} onRetry={() => void teamQuery.refetch()} /><BottomNav /></main>;
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
  const squadBio = bioDraft ?? team.bio ?? '';

  return (
    <main className="page">
      <AppBar title={t('league4.mySquad')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">{season.name}</p>
        <StatusBadge value={season.status} />
      </div>

      <section className="hero hero-glow mt-3">
        <div className="flex items-center gap-3">
          <TeamLogo path={team.logo_path} name={team.name} className="h-16 w-16 text-2xl" rounded="rounded-2xl" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link to={`/4vs4/teams/${team.id}`} className="font-display min-w-0 flex-1 truncate text-2xl tracking-wide">{team.name}</Link>
            <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-semibold tabular-nums" title={t('league4.roster')}>
              {team.member_count}/{season.roster_max}
            </span>
            <StatusBadge value={team.status} />
          </div>
        </div>
        <p className="mt-1 text-xs opacity-60">{t('league4.playersCount', { n: team.member_count })} · {t('league4.captain')}: {team.captain_profile?.display_name ?? team.captain_profile?.username ?? '—'}</p>
        {team.bio && <p className="mt-2 text-sm opacity-80">{team.bio}</p>}
        <div className="mt-2">
          <CopyButton text={`${window.location.origin}/4vs4/teams/${team.id}`} label={t('common.inviteLink')} />
        </div>
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

      {logoStatusLocked && (
        <p className="mt-2 rounded-lg border border-[var(--border)] p-2 text-xs opacity-70">{t('league4.logoLocked')}</p>
      )}

      {canEditProfile && (
        <section className="card mt-3">
          <h2 className="card-title flex items-center gap-1"><Icon name="camera" className="h-4 w-4 text-brand-400" /> {t('league4.squadLogo')}</h2>
          <p className="mt-1 text-xs opacity-60">{t('league4.logoHint')}</p>
          <div className="mt-2 flex items-center gap-3">
            <TeamLogo path={team.logo_path} name={team.name} className="h-14 w-14 text-xl" rounded="rounded-2xl" />
            <label className={`btn-ghost h-10 cursor-pointer px-3 text-sm ${busy !== null ? 'pointer-events-none opacity-60' : ''}`}>
              {team.logo_path ? t('league4.changeLogo') : t('league4.uploadLogo')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy !== null}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) uploadLogo(file);
                }}
              />
            </label>
            {team.logo_path && (
              <button type="button" disabled={busy !== null} onClick={removeLogo} className="btn-danger h-10 px-3 text-sm">
                {t('league4.removeLogo')}
              </button>
            )}
          </div>
        </section>
      )}

      {canEditProfile && (
        <form
          className="card mt-3 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run('bio', async () => {
              await setLeagueTeamBio(team.id, squadBio);
              setBioDraft(null);
            }, t('league4.bioUpdated'));
          }}
        >
          <h2 className="card-title flex items-center gap-1"><Icon name="pencil" className="h-4 w-4 text-brand-400" /> {t('league4.squadBio')}</h2>
          <p className="text-xs opacity-60">{t('league4.bioHint')}</p>
          <textarea
            rows={3}
            maxLength={160}
            value={squadBio}
            onChange={(event) => setBioDraft(event.target.value)}
            placeholder={t('league4.bioPlaceholder')}
            className="input resize-none text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] opacity-50">{squadBio.length}/160</span>
            <button type="submit" disabled={busy === 'bio' || squadBio.trim().length > 160} className="btn-primary h-10 px-4 text-sm">{t('league4.saveBio')}</button>
          </div>
        </form>
      )}

      <section className="card mt-3">
        <h2 className="card-title flex items-center gap-1"><Icon name="users" className="h-4 w-4 text-brand-400" /> {t('league4.roster')}
          <span className="ms-auto rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold tabular-nums">{team.member_count}/{season.roster_max}</span>
        </h2>
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
          <h2 className="card-title flex items-center gap-1"><Icon name="plus" className="h-4 w-4 text-brand-400" /> {t('league4.invitePlayers')}
            <span className="ms-auto rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold tabular-nums">{team.member_count}/{season.roster_max}</span>
          </h2>
          <p className="mt-1 text-xs opacity-60">{t('league4.invitePlayersHint', { min: season.roster_min, max: season.roster_max })}</p>
          <div className="relative mt-2">
            <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input h-10 ps-9 text-sm" placeholder={t('league4.searchPlayers')} />
          </div>
          <div className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {candidates.map((player) => {
              const playerName = player.display_name ?? player.username;
              const statusLabel = player.squad_status === 'FREE'
                ? t('league4.freeToJoin')
                : player.squad_status === 'INVITED'
                  ? t('league4.invitePending')
                  : t('league4.playerInSquad');
              const statusClass = player.squad_status === 'FREE'
                ? 'text-brand-400'
                : player.squad_status === 'INVITED'
                  ? 'text-accent-400'
                  : 'opacity-50';
              return (
                <div key={player.id} className="flex items-center gap-2 rounded-lg p-1.5">
                  <Avatar path={player.avatar_url} name={playerName} className="h-9 w-9 text-sm" zoomable={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{playerName}</p>
                    <p className={`truncate text-[10px] font-medium ${statusClass}`} title={player.squad_name ?? undefined}>
                      {statusLabel}{player.squad_name ? ` · ${player.squad_name}` : ''}
                    </p>
                  </div>
                  {player.squad_status === 'FREE' && (
                    <button type="button" disabled={busy === `invite-player-${player.id}`} onClick={() => invitePlayer(player.id, playerName)} className="btn-ghost h-9 px-3 text-xs">{t('league4.invite')}</button>
                  )}
                  {player.squad_status === 'INVITED' && player.invite_id && (
                    <button type="button" disabled={busy === `revoke-invite-${player.invite_id}`} onClick={() => undoInvite(player.invite_id!, playerName)} className="btn-ghost h-9 px-3 text-xs">{t('league4.undoInvite')}</button>
                  )}
                </div>
              );
            })}
            {candidates.length === 0 && <p className="py-3 text-center text-xs opacity-60">{search.trim() ? t('league4.noSearchResults') : t('league4.noEligiblePlayers')}</p>}
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
                    <button
                      type="button"
                      disabled={busy === `revoke-invite-${invite.id}`}
                      onClick={() => undoInvite(invite.id, invite.player?.display_name ?? invite.player?.username ?? '?')}
                      className="btn-ghost h-8 px-2 text-[10px]"
                    >
                      {t('league4.undoInvite')}
                    </button>
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
