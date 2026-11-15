import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;

/**
 * Locks body scroll while an overlay is open. iOS Safari ignores plain
 * `overflow: hidden` in some rubber-band cases, so the body is pinned with
 * `position: fixed` and the scroll offset is restored on unlock. A counter
 * keeps nested overlays (sheet + confirm dialog) safe.
 */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) {
      return;
    }
    if (typeof document === "undefined") {
      return;
    }
    const body = document.body;
    lockCount += 1;
    if (lockCount === 1) {
      savedScrollY = window.scrollY;
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.overscrollBehavior = "contain";
    }
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        body.style.overflow = "";
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.overscrollBehavior = "";
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [locked]);
}
