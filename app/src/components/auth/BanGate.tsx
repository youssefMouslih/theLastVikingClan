import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import Icon from '../ui/Icon';

// Blocking screen for a BANNED member: shows the staff-written motif and lets
// the member send one appeal to the admins. The router never renders the app
// underneath because this overlay sits above everything.
export default function BanGate() {
  const { t, tError } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const init = useAuthStore((s) => s.init);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me || me.status !== 'BANNED') return null;

  async function sendAppeal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const message = text.trim();
    if (message.length < 10) {
      setError(t('ban.appealTooShort'));
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({ ban_request: message.slice(0, 500), ban_requested_at: new Date().toISOString() })
        .eq('id', me!.id);
      if (err) throw new Error(err.message);
      setSent(true);
      await init();
    } catch (err) {
      setError(tError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ban-title" className="fixed inset-0 z-[9995] flex items-center justify-center overflow-y-auto bg-black/90 p-4">
      <div className="card w-full max-w-md border-red-500/40">
        <Icon name="shield" className="mx-auto h-12 w-12 text-red-400" />
        <h1 id="ban-title" className="font-display mt-2 text-center text-2xl tracking-wide text-red-300">{t('ban.title')}</h1>
        <p className="mt-2 text-center text-sm opacity-80">{t('ban.intro', { name: me.display_name ?? me.username })}</p>

        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-red-300">{t('ban.reason')}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{me.ban_reason || t('ban.noReason')}</p>
        </div>

        {sent || (me.ban_request && me.ban_requested_at) ? (
          <div className="mt-4 rounded-xl border border-(--border) bg-(--surface-2) p-3 text-sm">
            <p className="font-semibold text-green-400">{t('ban.appealSent')}</p>
            {me.ban_request && <p className="mt-1 whitespace-pre-line opacity-80">{me.ban_request}</p>}
          </div>
        ) : (
          <form onSubmit={sendAppeal} className="mt-4 flex flex-col gap-2">
            <label className="label">{t('ban.appealLabel')}
              <textarea
                className="input h-auto py-2 text-sm"
                rows={4}
                maxLength={500}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('ban.appealPlaceholder')}
              />
            </label>
            {error && <p role="alert" className="text-sm font-medium text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary h-11 w-full text-sm">
              {busy ? t('common.saving') : t('ban.appealSend')}
            </button>
          </form>
        )}

        <button type="button" onClick={() => void logout()} className="btn-ghost mt-3 h-11 w-full text-sm">
          {t('profile.logout')}
        </button>
      </div>
    </div>
  );
}
