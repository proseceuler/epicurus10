export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmImpl = (opts: ConfirmOptions) => Promise<boolean>;

let impl: ConfirmImpl | null = null;

export function registerConfirmImpl(fn: ConfirmImpl | null) {
  impl = fn;
}

/** Promise-based confirm. Uses the in-app modal when mounted, otherwise window.confirm. */
export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  if (impl) return impl(opts);
  if (typeof window === 'undefined') return Promise.resolve(false);
  return Promise.resolve(window.confirm(opts.message));
}

export function confirmDelete(what: string): Promise<boolean> {
  return askConfirm({
    title: 'Delete this?',
    message: `Delete “${what}”? This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
}
