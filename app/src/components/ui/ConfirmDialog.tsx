import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { registerConfirmHost, type ConfirmRequest } from './confirm';

export default function ConfirmHost() {
  const { t } = useLocale();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => registerConfirmHost(setRequest), []);

  useEffect(() => {
    if (!request) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        request.resolve(false);
        setRequest(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus.current?.focus();
    };
  }, [request]);

  if (!request) return null;

  function answer(confirmed: boolean) {
    request?.resolve(confirmed);
    setRequest(null);
  }

  return (
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/80 p-4"
      onClick={(event) => { if (event.target === event.currentTarget) answer(false); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="card anim-rise w-full max-w-sm p-4"
      >
        <h2 id="confirm-title" className="font-display text-lg">{request.title ?? t('common.confirm')}</h2>
        <p id="confirm-message" className="mt-2 whitespace-pre-wrap text-sm opacity-80">{request.message}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => answer(false)} className="btn-ghost h-11 flex-1 text-sm">
            {request.cancelLabel ?? t('common.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => answer(true)}
            className={`${request.danger ? 'btn-danger' : 'btn-primary'} h-11 flex-1 text-sm`}
          >
            {request.confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
