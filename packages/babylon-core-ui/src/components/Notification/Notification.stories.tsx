import type { Meta, StoryObj } from "@storybook/react";

import { Text } from "../Text";

import { Notification } from "./Notification";

const meta: Meta<typeof Notification> = {
  title: "Components/Data Display/Indicators/Notification",
  component: Notification,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 760 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

const SuggestionLabel = ({ children }: { children: string }) => (
  <Text
    variant="caption"
    as="div"
    className="uppercase tracking-0.4 text-accent-secondary"
  >
    {children}
  </Text>
);

const OrderChip = ({ children }: { children: string }) => (
  <span className="rounded-full bg-secondary-highlight px-3 py-1 text-accent-primary">
    {children}
  </span>
);

/** Critical severity with inline, severity-colored action pills (Figma: "Liquidation can trigger now"). */
export const ErrorInlineActions: Story = {
  args: {
    variant: "error",
    title: "Liquidation can trigger right now",
    children:
      "BTC has dropped below your liquidation price ($88,400). Anyone can liquidate your position at any moment.",
    actions: [
      { label: "Add Collateral", emphasis: "primary", onClick: () => {} },
      { label: "Repay Debt", emphasis: "secondary", onClick: () => {} },
    ],
  },
};

/** Info notification with a dismiss control (Figma: "Position too small"). */
export const InfoDismissible: Story = {
  args: {
    variant: "info",
    title: "Position too small for vault analysis",
    children: "Collateral or debt below $1,000",
    onClose: () => {},
  },
};

/** Soft-pause uses the teal `paused` variant (Figma: "Protocol is soft-paused"). */
export const Paused: Story = {
  args: {
    variant: "paused",
    title: "Protocol is soft-paused",
    children: (
      <>
        New deposits, borrows, and withdrawals are disabled. You can{" "}
        <u>still repay debt</u> — liquidations remain active. <u>Learn more</u>
      </>
    ),
  },
};

/** Warning with an icon, a plain suggestion box, and a close control. */
export const WarningWithSuggestion: Story = {
  args: {
    variant: "warning",
    title: "Too many vaults to optimize",
    children:
      "You have 18 vaults. Beyond 17, the optimizer can't guarantee the best liquidation order — it falls back to a simpler largest-first approach. Your liquidation risk data is still accurate, but the order may not be optimal.",
    suggestion:
      "Consider consolidating smaller vaults into fewer larger ones — fewer vaults means lower fees and better optimization.",
    onClose: () => {},
  },
};

/** No icon chip + labeled suggestion box (Figma: "First liquidation takes everything"). */
export const WarningNoIconWithLabel: Story = {
  args: {
    variant: "warning",
    icon: null,
    title: "First liquidation takes everything",
    children:
      "With your current vaults, a single liquidation event seizes all your BTC — nothing remains protected behind it.",
    suggestion: (
      <>
        <SuggestionLabel>Suggestion</SuggestionLabel>
        <Text variant="body2" as="div" className="text-accent-secondary">
          To enable partial liquidation, withdraw your 0.70 BTC and re-deposit as
          two smaller vaults: 0.40 BTC sacrificial + 0.30 BTC protected.
        </Text>
      </>
    ),
  },
};

/** Suggestion box with custom content + a severity-colored action below (Figma: "Reorder vaults"). */
export const SuggestionBelowActions: Story = {
  args: {
    variant: "suggestion",
    icon: null,
    title: "Reorder vaults to lose less",
    children:
      "A different vault order makes the first liquidation event smaller — less BTC seized when it triggers.",
    suggestion: (
      <>
        <SuggestionLabel>Suggested order</SuggestionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <OrderChip>Vault 3 · 0.60 BTC</OrderChip>
          <span className="text-accent-secondary">→</span>
          <OrderChip>Vault 1 · 0.10 BTC</OrderChip>
          <span className="text-accent-secondary">→</span>
          <OrderChip>Vault 2 · 0.30 BTC</OrderChip>
        </div>
      </>
    ),
    actionsPlacement: "below",
    actions: [
      { label: "Apply Suggested Order", emphasis: "primary", onClick: () => {} },
    ],
  },
};

/** Success variant (not in Figma; included for completeness). */
export const Success: Story = {
  args: {
    variant: "success",
    title: "Position optimally structured",
    children:
      "BTC Vault ordering is correct and partial liquidation is enabled.",
  },
};

/** Every severity, stacked, to compare accent treatments (note the error tint). */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Notification variant="error" title="Error">
        Critical, immediate-action notification.
      </Notification>
      <Notification variant="warning" title="Warning">
        Something needs attention soon.
      </Notification>
      <Notification variant="info" title="Info">
        Neutral, informational message.
      </Notification>
      <Notification variant="success" title="Success">
        An action completed successfully.
      </Notification>
      <Notification variant="paused" title="Paused">
        A soft, lower-urgency status update.
      </Notification>
      <Notification variant="suggestion" title="Suggestion">
        An optional optimization the user can take.
      </Notification>
    </div>
  ),
};
