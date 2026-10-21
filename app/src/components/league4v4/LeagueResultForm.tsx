import { useState } from 'react';
import {
  RESULT_DECIDED_BY,
  validateResultInput,
  type ResultDraft,
  type ResultValidationError,
} from '../../competition/league4v4/result';
import { useLocale } from '../../i18n/LocaleContext';
import type { Dict } from '../../i18n/dictionaries';
import type { LeagueDecidedBy, LeagueDuelReport } from '../../types/league4v4';
import Icon from '../ui/Icon';
import LeagueEvidence from './LeagueEvidence';

const ERROR_KEYS: Record<ResultValidationError, keyof Dict> = {
  scores: 'league4.resultScoresError',
  decisive: 'league4.resultDecisiveError',
  'decided-by': 'league4.resultDecidedByError',
  evidence: 'league4.resultEvidenceRequired',
  note: 'league4.resultNoteTooLong',
};

const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EVIDENCE_MAX = 5 * 1024 * 1024;

export default function LeagueResultForm({
  myReport,
  busy = false,
  onSubmit,
}: {
  myReport: LeagueDuelReport | null;
  busy?: boolean;
  onSubmit: (input: ResultDraft, file: File | null) => Promise<void>;
}) {
  const { t } = useLocale();
  const [scoreFor, setScoreFor] = useState(myReport ? String(myReport.score_for) : '');
  const [scoreAgainst, setScoreAgainst] = useState(myReport ? String(myReport.score_against) : '');
  const [decidedBy, setDecidedBy] = useState<LeagueDecidedBy>(myReport?.decided_by ?? 'REGULATION');
  const [note, setNote] = useState(myReport?.note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasEvidence = !!file || !!myReport?.evidence_path;
  const numeric = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));
  const draft: ResultDraft = {
    score_for: numeric(scoreFor),
    score_against: numeric(scoreAgainst),
    decided_by: decidedBy,
    note: note.trim() || null,
  };
  const validation = validateResultInput(draft, hasEvidence);

  function chooseFile(selected: File | null) {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!EVIDENCE_TYPES.includes(selected.type.toLowerCase())) {
      setFile(null);
      setFileError(t('league4.resultEvidenceType'));
      return;
    }
    if (selected.size > EVIDENCE_MAX) {
      setFile(null);
      setFileError(t('league4.resultEvidenceSize'));
      return;
    }
    setFile(selected);
  }

  return (
    <form
      className="mt-2 rounded-xl border border-brand-500/30 bg-brand-500/5 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (validation) {
          setError(t(ERROR_KEYS[validation]));
          return;
        }
        setError(null);
        void onSubmit(draft, file).catch(() => {});
      }}
    >
      <h3 className="flex items-center gap-1 text-sm font-bold">
        <Icon name="camera" className="h-4 w-4 text-brand-400" /> {myReport ? t('league4.resultUpdate') : t('league4.resultReport')}
      </h3>
      <p className="mt-0.5 text-[11px] opacity-60">{t('league4.resultHint')}</p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="label text-xs">{t('league4.resultScoreFor')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            required
            value={scoreFor}
            onChange={(event) => setScoreFor(event.target.value)}
            className="input h-10 text-sm"
          />
        </label>
        <label className="label text-xs">{t('league4.resultScoreAgainst')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            required
            value={scoreAgainst}
            onChange={(event) => setScoreAgainst(event.target.value)}
            className="input h-10 text-sm"
          />
        </label>
      </div>

      <label className="label mt-2 text-xs">{t('league4.resultDecidedBy')}
        <select
          value={decidedBy}
          onChange={(event) => setDecidedBy(event.target.value as LeagueDecidedBy)}
          className="input h-10 text-sm"
        >
          {RESULT_DECIDED_BY.map((value) => (
            <option key={value} value={value}>
              {value === 'REGULATION'
                ? t('league4.resultRegulation')
                : value === 'EXTRA_TIME'
                  ? t('league4.resultExtraTime')
                  : t('league4.resultPenalties')}
            </option>
          ))}
        </select>
      </label>

      <label className="label mt-2 text-xs">{t('league4.resultNote')}
        <textarea
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="input text-sm"
        />
      </label>

      <div className="mt-2">
        {myReport?.evidence_path && (
          <div className="mb-1">
            <p className="text-[11px] font-semibold opacity-60">{t('league4.resultCurrentEvidence')}</p>
            <LeagueEvidence path={myReport.evidence_path} className="max-h-40" />
          </div>
        )}
        <label className="label text-xs">
          {myReport ? t('league4.resultReplaceEvidence') : t('league4.resultEvidence')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            className="input h-11 text-xs"
          />
        </label>
        <p className="text-[11px] opacity-50">{t('league4.resultEvidenceHint')}</p>
        {myReport && <p className="text-[11px] opacity-50">{t('league4.resultKeepEvidence')}</p>}
        {fileError && <p role="alert" className="text-xs text-red-400">{fileError}</p>}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary mt-2 h-10 w-full text-sm">
        {busy ? t('league4.resultSubmitting') : myReport ? t('league4.resultUpdate') : t('league4.resultReport')}
      </button>
    </form>
  );
}
