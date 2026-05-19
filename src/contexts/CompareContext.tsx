import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "traceium.compare.ids";
const MAX = 4;

interface CompareCtx {
  ids: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
  count: number;
}

const Ctx = createContext<CompareCtx | null>(null);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(0, MAX) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {}
  }, [ids]);

  const add = useCallback((id: string) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      return next.length > MAX ? next.slice(next.length - MAX) : next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const next = [...prev, id];
      return next.length > MAX ? next.slice(next.length - MAX) : next;
    });
  }, []);

  const clear = useCallback(() => setIds([]), []);

  const value = useMemo<CompareCtx>(
    () => ({
      ids,
      add,
      remove,
      toggle,
      clear,
      has: (id: string) => ids.includes(id),
      count: ids.length,
    }),
    [ids, add, remove, toggle, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompare(): CompareCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Fallback when used outside provider (e.g. SSR or storybook)
    return {
      ids: [],
      add: () => {},
      remove: () => {},
      toggle: () => {},
      clear: () => {},
      has: () => false,
      count: 0,
    };
  }
  return v;
}
