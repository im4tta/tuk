// ---------- Lightweight toast notifications ----------

let container = null;

function getContainer() {
  // Re-query if we don't have one yet, or the one we cached got detached
  // (e.g. a test resetting document.body between cases).
  if (!container || !container.isConnected) container = document.getElementById('toasts');
  return container;
}

/**
 * Show a toast. Optionally takes an `opts.action` ({label, onClick}) to
 * render a button inside the toast (used for "Undo" / "Add anyway"), and
 * `opts.duration` to override the default auto-dismiss time — actionable
 * toasts default to a longer window so there's actually time to click.
 * @param {string} msg
 * @param {'warn'|'err'|null} [kind]
 * @param {{action?: {label: string, onClick: () => void}, duration?: number}} [opts]
 * @returns {{dismiss: () => void}}
 */
export function toast(msg, kind, opts) {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = msg;
  el.appendChild(text);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.remove();
  };

  if (opts.action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = opts.action.label;
    btn.addEventListener('click', () => {
      dismiss();
      opts.action.onClick();
    });
    el.appendChild(btn);
  }

  getContainer().appendChild(el);
  const timer = setTimeout(dismiss, opts.duration || (opts.action ? 6000 : 3200));
  return { dismiss: () => { clearTimeout(timer); dismiss(); } };
}
