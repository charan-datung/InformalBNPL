"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Global navigation progress bar. App Router gives no router events, so we drive
 * it from the DOM: any internal link click or form submit starts a thin trickling
 * bar at the top of the viewport, and it completes when the pathname commits (or
 * a watchdog fires, e.g. for same-path server-action submits). Purely a
 * perceived-performance cue — every click feels acknowledged instantly even when
 * the server work behind it takes a moment.
 */
export default function TopProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const trickle = useRef<number | null>(null);
  const watchdog = useRef<number | null>(null);

  function clearTimers() {
    if (trickle.current) window.clearInterval(trickle.current);
    if (watchdog.current) window.clearTimeout(watchdog.current);
    trickle.current = null;
    watchdog.current = null;
  }

  function start() {
    if (active) return;
    setActive(true);
    setProgress(8);
    let p = 8;
    trickle.current = window.setInterval(() => {
      p = Math.min(p + Math.random() * 12, 90);
      setProgress(p);
    }, 240);
    // Safety net for navigations that never change the pathname.
    watchdog.current = window.setTimeout(complete, 10_000);
  }

  function complete() {
    clearTimers();
    setProgress(100);
    window.setTimeout(() => {
      setActive(false);
      window.setTimeout(() => setProgress(0), 200);
    }, 200);
  }

  // Finish whenever the route actually commits.
  useEffect(() => {
    complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.origin !== window.location.origin
      ) {
        return;
      }
      // Same-URL clicks don't navigate.
      if (anchor.pathname + anchor.search === window.location.pathname + window.location.search) {
        return;
      }
      start();
    }
    function onSubmit() {
      start();
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active && progress === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full bg-brand-600 shadow-[0_0_8px] shadow-brand-500/50 transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  );
}
