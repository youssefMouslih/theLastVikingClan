import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import AppBar from '../components/ui/AppBar';
import CopyButton from '../components/ui/CopyButton';
import Icon from '../components/ui/Icon';
import { useLocale } from '../i18n/LocaleContext';
import { useOath } from '../hooks/useOath';

const LAWS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const OATH_KEYS = ['code.o1', 'code.o2', 'code.o3', 'code.o4', 'code.o5', 'code.o6', 'code.o7'] as const;

// The Code: nine laws, the oath, the legacy.
export default function CodePage() {
  const { t } = useLocale();
  const { sworn, swear } = useOath();
  const [params] = useSearchParams();
  const initialTab = params.get('tab') === 'oath' || params.get('tab') === 'legacy' ? params.get('tab') as 'oath' | 'legacy' : 'code';
  const [tab, setTab] = useState<'code' | 'oath' | 'legacy'>(initialTab);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const oathText = OATH_KEYS.map((k) => t(k)).join('\n');

  async function doSwear() {
    setBusy(true); setMsg(null);
    try {
      await swear();
      setMsg(t('code.oathSworn'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <AppBar />
      <div className="hero mt-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-300">{t('code.kicker')}</p>
        <h1 className="font-display mt-1 text-2xl tracking-wide">THE LAST VIKING</h1>
        <Link to="/battles" className="btn-cta mt-3 w-full">{t('battle.title')}</Link>
      </div>

      <nav aria-label="Code sections" className="mt-3 flex gap-1 border-b border-[var(--border)]">
        {(['code', 'oath', 'legacy'] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`h-11 flex-1 px-2 text-sm font-semibold ${tab === tb ? 'border-b-2 border-brand-500 text-brand-400' : 'opacity-60'}`}
          >
            {tb === 'code' ? t('code.tabCode') : tb === 'oath' ? t('code.tabOath') : t('code.tabLegacy')}
          </button>
        ))}
      </nav>

      {tab === 'code' && (
        <section className="mt-3 flex flex-col gap-2">
          <div>
            <h2 className="font-display text-lg tracking-wide">{t('code.lawsTitle')}</h2>
            <p className="text-xs opacity-70">{t('code.lawsNote')}</p>
          </div>
          {LAWS.map((n) => (
            <article key={n} className="card flex gap-3 p-3">
              <span className="font-display text-2xl text-brand-400">{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][n - 1]}</span>
              <div>
                <h3 className="font-bold">{t(`code.l${n}t` as 'code.l1t')}</h3>
                <p className="status-badge text-[11px] text-accent-400">{t(`code.l${n}g` as 'code.l1g')}</p>
                <p className="mt-1 text-sm opacity-85">{t(`code.l${n}x` as 'code.l1x')}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === 'oath' && (
        <section className="card mt-3 text-center">
          <Icon name="shield" className="mx-auto h-10 w-10 text-brand-400" />
          <h2 className="font-display mt-1 text-xl tracking-wide">{t('code.oathTitle')}</h2>
          <div className="mx-auto mt-3 max-w-sm space-y-1.5">
            {OATH_KEYS.map((k, i) => (
              <p key={k} className={i >= 5 ? 'font-display text-accent-400' : 'text-sm'}>{t(k)}</p>
            ))}
          </div>
          {msg && <p className="mt-2 text-sm font-medium">{msg}</p>}
          <div className="mt-3 flex flex-col gap-2">
            {sworn ? (
              <p className="font-bold text-green-400">{t('code.oathSworn')}</p>
            ) : (
              <button disabled={busy} onClick={doSwear} className="btn-cta w-full">
                {busy ? t('common.loading') : t('code.oathSwear')}
              </button>
            )}
            <CopyButton text={`${t('code.oathTitle')}\n\n${oathText}`} label={t('code.oathCopy')} />
          </div>
        </section>
      )}

      {tab === 'legacy' && (
        <section className="card mt-3 text-center">
          <Icon name="medal" className="mx-auto h-10 w-10 text-brand-400" />
          <h2 className="font-display mt-1 text-xl tracking-wide">{t('code.legacyTitle')}</h2>
          <p className="mt-1 text-sm opacity-80">{t('code.legacyDesc')}</p>
          <Link to="/clan" className="btn-primary mt-3 w-full">{t('code.legacyOpen')}</Link>
        </section>
      )}
      <BottomNav />
    </main>
  );
}
