import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_MS = 15 * 60 * 1000;
const WARN_MS = 14 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

export interface IdleTimerApi {
  showWarning: boolean;
  secondsLeft: number;
  stayActive: () => void;
}

export function useIdleTimer(enabled: boolean, onTimeout: () => void): IdleTimerApi {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const lastActivityRef = useRef<number>(Date.now());
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const throttleRef = useRef<number>(0);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    warnTimerRef.current = null;
    logoutTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const scheduleTimers = useCallback(() => {
    clearTimers();
    warnTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      const expireAt = lastActivityRef.current + IDLE_MS;
      setSecondsLeft(Math.max(0, Math.ceil((expireAt - Date.now()) / 1000)));
      countdownRef.current = setInterval(() => {
        setSecondsLeft(Math.max(0, Math.ceil((expireAt - Date.now()) / 1000)));
      }, 1000);
      logoutTimerRef.current = setTimeout(() => {
        clearTimers();
        setShowWarning(false);
        onTimeoutRef.current();
      }, IDLE_MS - WARN_MS);
    }, WARN_MS);
  }, [clearTimers]);

  const resetActivity = useCallback(() => {
    if (showWarning) return; // ignore stray events while dialog is up
    const now = Date.now();
    if (now - throttleRef.current < 1000) return;
    throttleRef.current = now;
    lastActivityRef.current = now;
    scheduleTimers();
  }, [showWarning, scheduleTimers]);

  const stayActive = useCallback(() => {
    lastActivityRef.current = Date.now();
    throttleRef.current = Date.now();
    setShowWarning(false);
    scheduleTimers();
  }, [scheduleTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setShowWarning(false);
      return;
    }
    lastActivityRef.current = Date.now();
    scheduleTimers();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, resetActivity, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, resetActivity);
      }
      clearTimers();
    };
  }, [enabled, resetActivity, scheduleTimers, clearTimers]);

  return { showWarning, secondsLeft, stayActive };
}
