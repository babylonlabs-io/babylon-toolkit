import type { Meta, StoryObj } from "@storybook/react";

import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Components/Containers/Panels/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "A card component that automatically adapts to light and dark themes using the theme colors defined in the Tailwind configuration.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div>
        <h3 className="text-primary-main font-semibold mb-2">
          Card Title
        </h3>
        <p className="text-accent-primary">
          This card automatically changes appearance when switching between light and dark modes using the theme colors.
        </p>
        <div className="mt-4 p-3 bg-primary-main text-primary-contrast rounded">
          Theme-aware content
        </div>
      </div>
    ),
  },
};

export const WithThemeColors: Story = {
  args: {
    children: (
      <div className="space-y-4">
        <div>
          <h4 className="text-accent-primary font-medium mb-2">Primary Colors</h4>
          <div className="flex gap-2 flex-wrap">
            <div className="w-8 h-8 bg-primary-main rounded"></div>
            <div className="w-8 h-8 bg-primary-light rounded"></div>
            <div className="w-8 h-8 bg-primary-dark rounded"></div>
          </div>
        </div>

        <div>
          <h4 className="text-accent-primary font-medium mb-2">Secondary Colors</h4>
          <div className="flex gap-2 flex-wrap">
            <div className="w-8 h-8 bg-secondary-main rounded"></div>
            <div className="w-8 h-8 bg-secondary-strokeLight rounded border"></div>
            <div className="w-8 h-8 bg-secondary-highlight rounded"></div>
          </div>
        </div>

        <div>
          <h4 className="text-accent-primary font-medium mb-2">Surface Colors</h4>
          <div className="flex gap-2 flex-wrap">
            <div className="w-16 h-8 bg-surface rounded border border-secondary-strokeLight"></div>
          </div>
        </div>
      </div>
    ),
  },
};

export const WithExplicitDarkClasses: Story = {
  args: {
    children: (
      <div>
        <h3 className="text-primary-main dark:text-white font-semibold mb-2">
          Explicit Dark Mode Classes
        </h3>
        <p className="text-accent-primary dark:text-accent-secondary">
          This demonstrates using explicit dark: prefix classes alongside theme colors.
        </p>
        <div className="mt-4 p-3 bg-primary-main dark:bg-primary-dark text-primary-contrast rounded">
          Content with explicit dark mode overrides
        </div>
      </div>
    ),
  },
};
