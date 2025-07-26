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

  return <DocsContainer {...props} theme={activeTheme} />;
}
