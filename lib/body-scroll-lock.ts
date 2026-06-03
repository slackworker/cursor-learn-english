/** Prevent layout shift when locking page scroll (drawer/modal open). */
let lockCount = 0;
let savedBodyOverflow = "";
let savedBodyPaddingRight = "";

function getScrollbarWidth(): number {
  return window.innerWidth - document.documentElement.clientWidth;
}

/** Lock body scroll; returns cleanup. Safe to call multiple times (ref-counted). */
export function lockBodyScroll(): () => void {
  lockCount++;
  if (lockCount === 1) {
    savedBodyOverflow = document.body.style.overflow;
    savedBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = getScrollbarWidth();
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = savedBodyOverflow;
      document.body.style.paddingRight = savedBodyPaddingRight;
    }
  };
}
