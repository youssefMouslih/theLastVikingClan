import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { getClanSettings, updateClanSettings } from '../../services/clanService';

// Admin platform access: one switch controls whether the Create account
// button is shown on the login screen (no new accounts when hidden).
export default function AccessTab() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const open = query.data?.registration_open ?? true;

  async function setOpen(next: boolean) {
    setBusy(true); setMsg(null);
    try {
      await updateClanSettings({ registration_open: next });
      await qc.invalidateQueries({ queryKey: ['clan-settings'] });
      setMsg(t('admin.accessSaved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading) return <p className="mt-3 text-sm">{t('common.loading')}</p>;

  return (
    <div className="card mt-3 flex flex-col gap-2 p-3">
      <h2 className="font-bold">{t('admin.accessTitle')}</h2>
      <p className="text-sm opacity-70">{t('admin.accessDesc')}</p>
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label={t('admin.accessTitle')}
        disabled={busy}
        onClick={() => setOpen(!open)}
        className={`flex h-12 items-center justify-between rounded-xl border px-3 text-sm font-bold ${open ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-red-500/50 bg-red-500/10 text-red-400'}`}
      >
        <span>{open ? t('admin.regOpen') : t('admin.regClosed')}</span>
        <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition ${open ? 'bg-green-500' : 'bg-zinc-600'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${open ? 'start-[22px]' : 'start-0.5'}`} />
        </span>
      </button>
      {msg && <p className="text-sm opacity-80">{msg}</p>}
    </div>
  );
}
