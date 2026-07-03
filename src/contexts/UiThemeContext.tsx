import { useEffect } from "react";
import { useFeatureFlags } from "@/data/featureFlags";

/**
 * Toggles the "royal" UI theme (dark neumorphism + glass) by setting
 * `data-ui-theme="royal"` on the <html> element when the `new_ui_theme`
 * feature flag is enabled. All royal-theme styles in styles.css are
 * scoped under `[data-ui-theme="royal"]` so the default theme is
 * completely untouched when the flag is off.
 *
 * To avoid a theme flash between first paint and async flag hydration,
 * the last known value is cached in localStorage and applied
 * synchronously by an inline script in `__root.tsx` before the app
 * renders. Here we only mutate the attribute once the flag has actually
 * loaded, so we never stomp the cached value with a default.
 */
export function UiThemeProvider({ children }: { children: React.ReactNode }) {
  const { flags, loaded } = useFeatureFlags();

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!loaded) return;
    const royal = flags.find((f) => f.key === "new_ui_theme")?.enabled ?? false;
    const root = document.documentElement;
    if (royal) {
      root.setAttribute("data-ui-theme", "royal");
      root.classList.add("dark");
      try { localStorage.setItem("ui-theme-royal", "1"); } catch {}
    } else {
      root.removeAttribute("data-ui-theme");
      try { localStorage.setItem("ui-theme-royal", "0"); } catch {}
    }
  }, [loaded, flags]);

  return <>{children}</>;
}
