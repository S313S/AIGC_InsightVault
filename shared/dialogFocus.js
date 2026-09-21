const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const getDialogFocusableElements = (container) =>
  Array.from(container?.querySelectorAll?.(FOCUSABLE_SELECTOR) || []);

export const handleDialogKeyDown = (event, container, onClose, activeElement) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = getDialogFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container?.focus?.();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (activeElement && container?.contains && !container.contains(activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
