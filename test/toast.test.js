// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from '../src/toast.js';

function setupContainer() {
  document.body.innerHTML = '<div id="toasts"></div>';
}

beforeEach(() => {
  vi.useFakeTimers();
  setupContainer();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toast', () => {
  it('renders the message text', () => {
    toast('Hello there');
    const el = document.querySelector('.toast');
    expect(el.querySelector('.toast-text').textContent).toBe('Hello there');
  });

  it('applies the kind class', () => {
    toast('Careful', 'warn');
    expect(document.querySelector('.toast.warn')).not.toBeNull();
  });

  it('auto-dismisses after the default duration', () => {
    toast('Bye soon');
    expect(document.querySelector('.toast')).not.toBeNull();
    vi.advanceTimersByTime(3200);
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('renders an action button and fires its callback exactly once', () => {
    const onClick = vi.fn();
    toast('Deleted 1 screenshot.', null, { action: { label: 'Undo', onClick } });

    const btn = document.querySelector('.toast-action');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Undo');

    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    // The toast should remove itself immediately on click...
    expect(document.querySelector('.toast')).toBeNull();
    // ...and the pending auto-dismiss timer should be a no-op, not a
    // second removal (which could throw if something else already
    // replaced #toasts' contents).
    vi.advanceTimersByTime(10000);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('gives action toasts a longer default duration than plain toasts', () => {
    toast('Deleted 1 screenshot.', null, { action: { label: 'Undo', onClick: () => {} } });
    vi.advanceTimersByTime(3200);
    // A plain toast would be gone by now; an actionable one should not be.
    expect(document.querySelector('.toast')).not.toBeNull();
    vi.advanceTimersByTime(3000);
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('dismiss() from the returned handle clears the timer and removes the toast', () => {
    const handle = toast('Manual dismiss');
    handle.dismiss();
    expect(document.querySelector('.toast')).toBeNull();
  });
});
