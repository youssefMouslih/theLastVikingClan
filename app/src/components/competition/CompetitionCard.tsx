import { Link } from 'react-router';
import Icon from '../ui/Icon';
import StatusBadge from '../ui/StatusBadge';
import type { Competition } from '../../types/database';

export default function CompetitionCard({ comp, count }: { comp: Competition; count?: number }) {
  return (
    <Link to={`/competitions/${comp.id}`} className="card block transition hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
          <Icon name={comp.type === 'LEAGUE' ? 'trophy' : comp.type === 'CUP' ? 'medal' : 'swords'} className="h-5 w-5" />
        </span>
        <h3 className="font-display flex-1 truncate text-sm tracking-wide">{comp.name}</h3>
        <StatusBadge value={comp.status} />
      </div>
      <p className="mt-1 text-xs opacity-70">
        {comp.type} • {count ?? '—'} / {comp.max_players} players
        {comp.registration_deadline ? ` • closes ${new Date(comp.registration_deadline).toLocaleDateString()}` : ''}
      </p>
    </Link>
  );
}
