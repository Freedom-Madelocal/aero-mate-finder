import { useEffect } from "react";
import { useFeatureFlag } from "@/data/featureFlags";

/**
 * Toggles the "royal" UI theme (dark neumorphism + glass) by setting
 * `data-ui-theme="royal"` on the <html> element when the `new_ui_theme`
 * feature flag is enabled. All royal-theme styles in styles.css are
 * scoped under `[data-ui-theme="royal"]` so the default theme is
 * completely untouched when the flag is off.
 */
export function UiThemeProvider({ children }: { children: React.ReactNode }) {
  const royal = useFeatureFlag("new_ui_theme", false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (royal) {
      root.setAttribute("data-ui-theme", "royal");
      // Royal theme is dark-only for now.
      root.classList.add("dark");
    } else {
      root.removeAttribute("data-ui-theme");
    }
  }, [royal]);

  return <>{children}</>;
}
