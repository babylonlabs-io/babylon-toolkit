import { addons } from "@storybook/manager-api";
import { themes } from "@storybook/theming";
import { DARK_MODE_EVENT_NAME } from "storybook-dark-mode";

const channel = addons.getChannel();

function setManagerTheme(isDark: boolean) {
  addons.setConfig({ theme: isDark ? { ...themes.dark, appBg: "#1f1f20" } : themes.light });
}

// Initial theme (defaults to light)
setManagerTheme(false);

// Listen to dark-mode toggle and update manager theme accordingly
channel.on(DARK_MODE_EVENT_NAME, (isDark: boolean) => {
  setManagerTheme(isDark);
});
