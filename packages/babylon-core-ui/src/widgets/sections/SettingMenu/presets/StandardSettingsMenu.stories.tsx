import { Meta, StoryFn } from "@storybook/react";
import { useState } from "react";
import { StandardSettingsMenu } from "./StandardSettingsMenu";

export default {
  title: "Widgets/Menus/SettingsMenuPresets",
  tags: ["autodocs"],
} as Meta;

export const Default: StoryFn = () => {
  const [theme, setTheme] = useState<string>("system");

  return (
    <div className="p-4">
      <h2 className="mb-4 text-lg font-semibold">StandardSettingsMenu</h2>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        Standard settings menu for all Babylon applications.
        Includes theme toggle, Terms of Use, and Privacy Policy.
      </p>
      <StandardSettingsMenu theme={theme} setTheme={setTheme} />
    </div>
  );
};

Default.storyName = "StandardSettingsMenu";

