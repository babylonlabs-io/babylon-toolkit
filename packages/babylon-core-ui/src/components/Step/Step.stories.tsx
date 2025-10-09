import type { Meta, StoryObj } from "@storybook/react";
import { Step } from "./Step";

const meta: Meta<typeof Step> = {
  title: "Components/Step",
  component: Step,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    step: {
      control: { type: "number", min: 1, max: 10 },
      description: "Step number",
    },
    currentStep: {
      control: { type: "number", min: 1, max: 10 },
      description: "Currently active step number",
    },
    children: {
      control: "text",
      description: "Step label/description",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A completed step shows a checkmark icon
 */
export const Completed: Story = {
  args: {
    step: 1,
    currentStep: 3,
    children: "This step is complete",
  },
};

/**
 * The active step shows a spinner animation
 */
export const Active: Story = {
  args: {
    step: 2,
    currentStep: 2,
    children: "This step is currently active",
  },
};

/**
 * A pending step shows the step number
 */
export const Pending: Story = {
  args: {
    step: 3,
    currentStep: 1,
    children: "This step is pending",
  },
};

/**
 * Example of a 3-step process
 */
export const MultiStepProcess: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-[500px]">
      <Step step={1} currentStep={2}>
        Sign Transaction
      </Step>
      <Step step={2} currentStep={2}>
        Broadcast to Network
      </Step>
      <Step step={3} currentStep={2}>
        Confirm on Chain
      </Step>
    </div>
  ),
};

/**
 * All steps completed
 */
export const AllCompleted: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-[500px]">
      <Step step={1} currentStep={4}>
        Sign Transaction
      </Step>
      <Step step={2} currentStep={4}>
        Broadcast to Network
      </Step>
      <Step step={3} currentStep={4}>
        Confirm on Chain
      </Step>
    </div>
  ),
};

