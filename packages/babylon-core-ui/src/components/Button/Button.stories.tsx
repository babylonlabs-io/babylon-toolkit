import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Components/Inputs/Actions/Button",
  component: Button,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "Button" },
};

export const Variants: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button variant="contained">Contained</Button>
      <Button variant="outlined">Outlined</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <Button variant="contained" color="primary">
          Primary Contained
        </Button>
        <Button variant="contained" color="secondary">
          Secondary Contained
        </Button>
      </div>
      <div className="flex gap-4">
        <Button variant="outlined" color="primary">
          Primary Outlined
        </Button>
        <Button variant="outlined" color="secondary">
          Secondary Outlined
        </Button>
      </div>
      <div className="flex gap-4">
        <Button variant="ghost" color="primary">
          Primary Ghost
        </Button>
        <Button variant="ghost" color="secondary">
          Secondary Ghost
        </Button>
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="small">Small</Button>
      <Button size="medium">Medium</Button>
      <Button size="large">Large</Button>
    </div>
  ),
};

export const Fluid: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <Button fluid>Fluid Button</Button>
    </div>
  ),
};

export const Rounded: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button>Default</Button>
      <Button rounded>Rounded</Button>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <Button disabled variant="contained">
          Disabled Contained
        </Button>
        <Button disabled variant="outlined">
          Disabled Outlined
        </Button>
        <Button disabled variant="ghost">
          Disabled Ghost
        </Button>
      </div>
      <div className="flex gap-4">
        <Button disabled variant="contained" color="secondary">
          Disabled Secondary
        </Button>
        <Button disabled variant="outlined" color="secondary">
          Disabled Secondary Outlined
        </Button>
      </div>
    </div>
  ),
};

export const AllVariations: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Contained Primary</h3>
        <div className="flex items-center gap-4">
          <Button variant="contained" color="primary" size="small">
            Small
          </Button>
          <Button variant="contained" color="primary" size="medium">
            Medium
          </Button>
          <Button variant="contained" color="primary" size="large">
            Large
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Outlined Primary</h3>
        <div className="flex items-center gap-4">
          <Button variant="outlined" color="primary" size="small">
            Small
          </Button>
          <Button variant="outlined" color="primary" size="medium">
            Medium
          </Button>
          <Button variant="outlined" color="primary" size="large">
            Large
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Ghost Primary</h3>
        <div className="flex items-center gap-4">
          <Button variant="ghost" color="primary" size="small">
            Small
          </Button>
          <Button variant="ghost" color="primary" size="medium">
            Medium
          </Button>
          <Button variant="ghost" color="primary" size="large">
            Large
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">With Modifiers</h3>
        <div className="flex flex-col gap-2">
          <Button rounded>Rounded Button</Button>
          <div className="w-full max-w-md">
            <Button fluid>Fluid Button</Button>
          </div>
          <Button rounded fluid>
            Rounded & Fluid
          </Button>
        </div>
      </div>
    </div>
  ),
};
