import { normalizedReportScore } from '../../competition/league4v4/result';
import { useLocale } from '../../i18n/LocaleContext';
import type { LeagueDuelReportWithPlayer } from '../../types/league4v4';
import Avatar from '../ui/Avatar';
import StatusBadge from '../ui/StatusBadge';
import LeagueEvidence from './LeagueEvidence';

export default function LeagueReportCard({
  report,
  homeName,
  awayName,
  isMine = false,
}: {
  report: LeagueDuelReportWithPlayer;
  homeName: string;
  awayName: string;
  isMine?: boolean;
}) {
  const { t, fmtDate } = useLocale();
  const score = normalizedReportScore(report);
  const reporter = report.player?.display_name ?? report.player?.username ?? report.player_id.slice(0, 8);

  return (
    <div className="rounded-xl border border-[var(--border)] p-2">
      <div className="flex items-center gap-2">
        <Avatar path={report.player?.avatar_url ?? null} name={reporter} className="h-7 w-7 text-[11px]" zoomable={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">
            {isMine ? t('league4.resultMine') : t('league4.resultReportedBy', { name: reporter })}
          </p>
          <p className="text-[10px] opacity-50">{fmtDate(report.submitted_at)}</p>
        </div>
        <StatusBadge value={report.status} />
      </div>
      <p className="mt-2 text-center font-display text-sm font-bold tabular-nums">
        {homeName} {score.home_score}–{score.away_score} {awayName}
      </p>
      <p className="mt-0.5 text-center text-[11px] opacity-60">
        {report.decided_by === 'REGULATION'
          ? t('league4.resultRegulation')
          : report.decided_by === 'EXTRA_TIME'
            ? t('league4.resultExtraTime')
            : t('league4.resultPenalties')}
      </p>
      {report.note && <p className="mt-1 whitespace-pre-wrap text-xs opacity-70">{report.note}</p>}
      <LeagueEvidence path={report.evidence_path} label={t('league4.evidence')} />
    </div>
  );
}
