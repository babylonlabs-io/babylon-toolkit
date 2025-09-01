import { useMemo, useState, useEffect } from "react";
import * as React from "react";
import { addons } from "@storybook/preview-api";
import { DocsContainer, DocsContainerProps } from "@storybook/addon-docs";
import { themes } from "@storybook/theming";
import { DARK_MODE_EVENT_NAME } from "storybook-dark-mode";

const channel = addons.getChannel();

export default function ThemeableDocContainer(props: DocsContainerProps) {
  const [isDark, setDark] = useState(false);

  const activeTheme = useMemo(
    () => (isDark ? { ...themes.dark, appPreviewBg: "#222425" } : themes.light),
    [isDark]
  );

  useEffect(() => {
    channel.on(DARK_MODE_EVENT_NAME, setDark);

    return () => channel.removeListener(DARK_MODE_EVENT_NAME, setDark);
  }, [setDark]); 

  useEffect(() => {
    const handleThemeChange = (theme: string) => {
      setDark(theme === "dark");
    };

    channel.on("STORYBOOK_THEME_CHANGED", handleThemeChange);
    
    // Also listen to global state changes for compatibility
    channel.on("GLOBALS_UPDATED", ({ globals }: { globals: Record<string, any> }) => {
      if (globals.theme) {
        setDark(globals.theme === "dark");
      }
    });

    // Fallback: observe class changes on html/body for any external toggles
    const html = document.documentElement;
    const body = document.body;
    const observer = new MutationObserver(() => {
      const hasDark = html.classList.contains("dark") || body.classList.contains("dark");
      setDark(hasDark);
    });
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    observer.observe(body, { attributes: true, attributeFilter: ["class"] });

    return () => {
      channel.removeListener("STORYBOOK_THEME_CHANGED", handleThemeChange);
      channel.removeListener("GLOBALS_UPDATED", ({ globals }: { globals: Record<string, any> }) => {
        if (globals.theme) {
          setDark(globals.theme === "dark");
        }
      });
      observer.disconnect();
    };
  }, []);

  return <DocsContainer {...props} theme={activeTheme} />;
}
