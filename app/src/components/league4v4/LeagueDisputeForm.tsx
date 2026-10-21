import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import Icon from '../ui/Icon';

const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EVIDENCE_MAX = 5 * 1024 * 1024;

export default function LeagueDisputeForm({
  busy = false,
  onSubmit,
}: {
  busy?: boolean;
  onSubmit: (reason: string, file: File | null) => Promise<void>;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function chooseFile(selected: File | null) {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!EVIDENCE_TYPES.includes(selected.type.toLowerCase())) {
      setFile(null);
      setError(t('league4.resultEvidenceType'));
      return;
    }
    if (selected.size > EVIDENCE_MAX) {
      setFile(null);
      setError(t('league4.resultEvidenceSize'));
      return;
    }
    setFile(selected);
  }

  if (!open) {
    return (
      <button type="button" disabled={busy} onClick={() => setOpen(true)} className="btn-ghost mt-2 h-9 w-full text-xs">
        <Icon name="shield" className="h-3.5 w-3.5" /> {t('league4.resultDispute')}
      </button>
    );
  }

  return (
    <form
      className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim().length < 3) {
          setError(t('league4.resultDisputeMin'));
          return;
        }
        setError(null);
        void onSubmit(reason.trim(), file)
          .then(() => {
            setOpen(false);
            setReason('');
            setFile(null);
          })
          .catch(() => {});
      }}
    >
      <h3 className="flex items-center gap-1 text-sm font-bold text-amber-500">
        <Icon name="shield" className="h-4 w-4" /> {t('league4.resultDispute')}
      </h3>
      <p className="mt-0.5 text-[11px] opacity-60">{t('league4.resultDisputeHint')}</p>
      <label className="label mt-2 text-xs">{t('league4.resultDisputeReason')}
        <textarea
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="input text-sm"
        />
      </label>
      <label className="label mt-2 text-xs">{t('league4.resultDisputeEvidence')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          className="input h-11 text-xs"
        />
      </label>
      <p className="text-[11px] opacity-50">{t('league4.resultEvidenceHint')}</p>
      {error && <p role="alert" className="mt-1 text-xs text-red-400">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost h-10 flex-1 text-xs">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={busy} className="btn-danger h-10 flex-1 text-xs">
          {busy ? t('league4.resultSubmitting') : t('league4.resultDisputeSubmit')}
        </button>
      </div>
    </form>
  );
}
