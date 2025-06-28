import type { Preview } from "@storybook/react";
import { themes } from "@storybook/theming";

import ThemeableDocContainer from "./components/ThemeableDocContainer";

import "../src/index.css";

const preview: Preview = {
  parameters: {
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
};

export default preview;
