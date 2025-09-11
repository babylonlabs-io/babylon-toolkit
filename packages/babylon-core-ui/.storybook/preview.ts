import type { Preview } from "@storybook/react";
import { themes } from "@storybook/theming";
import { addons } from "@storybook/preview-api";
import { DARK_MODE_EVENT_NAME } from "storybook-dark-mode";
import { useEffect } from "react";

import ThemeableDocContainer from "./components/ThemeableDocContainer";

import "../src/index.css";

const channel = addons.getChannel();

const withThemeSync = (StoryFn: any) => {
  useEffect(() => {
    const syncTheme = (isDark: boolean) => {
      document.documentElement.classList.toggle("dark", isDark);
      if (isDark) {
        document.documentElement.setAttribute("data-mode", "dark");
      } else {
        document.documentElement.removeAttribute("data-mode");
      }
    };

    const getCurrentTheme = () => {
      try {
        const stored = localStorage.getItem('storybook-dark-mode');
        if (stored === 'null' || stored === null || stored === 'undefined') {
          const storybookManager = window.parent?.document;
          const isDarkFromManager = storybookManager?.documentElement?.classList?.contains('dark') ||
            storybookManager?.body?.classList?.contains('dark');
          return isDarkFromManager || false;
        }
        return stored === 'true';
      } catch {
        return false;
      }
    };

    syncTheme(getCurrentTheme());

    const handleThemeToggle = (isDark: boolean) => {
      syncTheme(isDark);
    };

    channel.on(DARK_MODE_EVENT_NAME, handleThemeToggle);

    return () => {
      channel.removeListener(DARK_MODE_EVENT_NAME, handleThemeToggle);
    };
  }, []);

  return StoryFn();
};

const preview: Preview = {
  parameters: {
    options: {
      storySort: {
        order: ["Components", "Elements", "Widgets", "*"],
      },
    },
    darkMode: {
      current: "light",
      darkClass: "dark",
      lightClass: "light",
      dark: { ...themes.dark, appPreviewBg: "#222425" },
      light: themes.light,
      stylePreview: true,
    },
    docs: {
      container: ThemeableDocContainer,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [withThemeSync],
};

export default preview;
