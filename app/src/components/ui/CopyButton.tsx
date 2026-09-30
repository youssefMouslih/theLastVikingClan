import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';

// One-tap copy with fallback for older browsers / non-secure contexts.
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useLocale();
  const [ok, setOk] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } catch {
      setOk(false);
    }
  }

  return (
    <button type="button" onClick={copy} className="btn-ghost h-9 px-3 text-xs">
      {ok ? t('common.copied') : label}
    </button>
  );
}
