// ---------- Lightweight toast notifications ----------

let container = null;

function getContainer() {
  if (!container) container = document.getElementById('toasts');
  return container;
}

export function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  getContainer().appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
