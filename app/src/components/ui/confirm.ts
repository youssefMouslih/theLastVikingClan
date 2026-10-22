export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

let openConfirm: ((request: ConfirmRequest) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!openConfirm) {
      resolve(window.confirm(options.message));
      return;
    }
    openConfirm({ ...options, resolve });
  });
}

export function registerConfirmHost(handler: (request: ConfirmRequest) => void): () => void {
  openConfirm = handler;
  return () => { openConfirm = null; };
}
