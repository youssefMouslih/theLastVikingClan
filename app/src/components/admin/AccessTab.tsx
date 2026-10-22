import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { getClanSettings, updateClanSettings } from '../../services/clanService';

// Admin platform access: one switch controls whether the Create account
// button is shown on the login screen (no new accounts when hidden).
export default function AccessTab() {
  const { t , tError} = useLocale();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const open = query.data?.registration_open ?? true;
  // Auto-Jarl settings (0036): staged locally, saved with one button.
  const [jarlOn, setJarlOn] = useState<boolean | null>(null);
  const [confirmHours, setConfirmHours] = useState<string | null>(null);
  const [graceHours, setGraceHours] = useState<string | null>(null);
  const [forfeitMode, setForfeitMode] = useState<'auto' | 'manual' | null>(null);
  const jarlEffective = jarlOn ?? query.data?.auto_jarl_enabled ?? true;

  async function setJarl(next: boolean) {
    setBusy(true); setMsg(null);
    try {
      await updateClanSettings({ auto_jarl_enabled: next });
      setJarlOn(next);
      await qc.invalidateQueries({ queryKey: ['clan-settings'] });
      setMsg(t('admin.accessSaved'));
    } catch (err) {
      setMsg(tError(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveJarl() {
    const ch = Math.max(1, Math.floor(Number(confirmHours ?? query.data?.auto_confirm_hours ?? 48)));
    const gh = Math.max(0, Math.floor(Number(graceHours ?? query.data?.overdue_grace_hours ?? 48)));
    const fm = forfeitMode ?? query.data?.forfeit_mode ?? 'manual';
    setBusy(true); setMsg(null);
    try {
      await updateClanSettings({ auto_confirm_hours: ch, overdue_grace_hours: gh, forfeit_mode: fm });
      setConfirmHours(String(ch)); setGraceHours(String(gh)); setForfeitMode(fm);
      await qc.invalidateQueries({ queryKey: ['clan-settings'] });
      setMsg(t('admin.accessSaved'));
    } catch (err) {
      setMsg(tError(err));
    } finally {
      setBusy(false);
    }
  }
  async function setOpen(next: boolean) {
    setBusy(true); setMsg(null);
    try {
      await updateClanSettings({ registration_open: next });
      await qc.invalidateQueries({ queryKey: ['clan-settings'] });
      setMsg(t('admin.accessSaved'));
    } catch (err) {
      setMsg(tError(err));
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
      <div className="mt-2 border-t border-[var(--border)] pt-3">
        <h2 className="font-bold">{t('admin.jarlTitle')}</h2>
        <p className="mt-0.5 text-sm opacity-70">{t('admin.jarlDesc')}</p>
        <button
          type="button"
          role="switch"
          aria-checked={jarlEffective}
          aria-label={t('admin.jarlTitle')}
          disabled={busy}
          onClick={() => setJarl(!jarlEffective)}
          className={`mt-2 flex h-12 w-full items-center justify-between rounded-xl border px-3 text-sm font-bold ${jarlEffective ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-red-500/50 bg-red-500/10 text-red-400'}`}
        >
          <span>{jarlEffective ? t('admin.jarlOn') : t('admin.jarlOff')}</span>
          <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition ${jarlEffective ? 'bg-green-500' : 'bg-zinc-600'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${jarlEffective ? 'start-[22px]' : 'start-0.5'}`} />
          </span>
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="label text-xs">{t('admin.confirmHours')}
            <input
              type="number" min={1} max={720} dir="ltr"
              className="input h-11 text-center"
              value={confirmHours ?? query.data?.auto_confirm_hours ?? 48}
              onChange={(e) => setConfirmHours(e.target.value)}
            />
          </label>
          <label className="label text-xs">{t('admin.graceHours')}
            <input
              type="number" min={0} max={720} dir="ltr"
              className="input h-11 text-center"
              value={graceHours ?? query.data?.overdue_grace_hours ?? 48}
              onChange={(e) => setGraceHours(e.target.value)}
            />
          </label>
        </div>
        <label className="label mt-2 text-xs">{t('admin.forfeitMode')}
          <select
            className="input h-11"
            value={forfeitMode ?? query.data?.forfeit_mode ?? 'manual'}
            onChange={(e) => setForfeitMode(e.target.value === 'auto' ? 'auto' : 'manual')}
          >
            <option value="manual">{t('admin.forfeitManual')}</option>
            <option value="auto">{t('admin.forfeitAuto')}</option>
          </select>
        </label>
        <button type="button" disabled={busy} onClick={saveJarl} className="btn-primary mt-2 h-11 w-full text-sm">
          {t('common.save')}
        </button>
      </div>
      {msg && <p className="text-sm opacity-80">{msg}</p>}
    </div>
  );
}
