import type { Meta, StoryObj } from "@storybook/react";
import { Tabs } from "./Tabs";
import { useState } from "react";

const meta: Meta<typeof Tabs> = {
  title: "Components/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A tabs component for organizing content into multiple panels with tab navigation. Supports controlled and uncontrolled modes, as well as keeping all tab panels mounted.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  args: {
    items: [
      {
        id: "tab1",
        label: "Tab 1",
        content: (
          <div className="rounded bg-primary-highlight p-4 text-accent-primary">
            Content for Tab 1
          </div>
        ),
      },
      {
        id: "tab2",
        label: "Tab 2",
        content: (
          <div className="rounded bg-primary-highlight p-4 text-accent-primary">
            Content for Tab 2
          </div>
        ),
      },
      {
        id: "tab3",
        label: "Tab 3",
        content: (
          <div className="rounded bg-primary-highlight p-4 text-accent-primary">
            Content for Tab 3
          </div>
        ),
      },
    ],
    defaultActiveTab: "tab1",
  },
};

export const Controlled: Story = {
  render: () => {
    const [activeTab, setActiveTab] = useState("tab1");
    return (
      <div>
        <div className="mb-4 text-accent-secondary text-sm">
          Active tab: {activeTab}
        </div>
        <Tabs
          items={[
            {
              id: "tab1",
              label: "Tab 1",
              content: (
                <div className="rounded bg-primary-highlight p-4 text-accent-primary">
                  Controlled Tab 1 Content
                </div>
              ),
            },
            {
              id: "tab2",
              label: "Tab 2",
              content: (
                <div className="rounded bg-primary-highlight p-4 text-accent-primary">
                  Controlled Tab 2 Content
                </div>
              ),
            },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    );
  },
};

export const KeepMounted: Story = {
  args: {
    items: [
      {
        id: "tab1",
        label: "Form Tab",
        content: (
          <div className="rounded bg-primary-highlight p-4">
            <input
              type="text"
              placeholder="This input state is preserved when switching tabs"
              className="w-full rounded border border-secondary-strokeLight bg-surface p-2 text-accent-primary"
            />
          </div>
        ),
      },
      {
        id: "tab2",
        label: "Another Tab",
        content: (
          <div className="rounded bg-primary-highlight p-4 text-accent-primary">
            Switch back to Form Tab - your input will still be there!
          </div>
        ),
      },
    ],
    keepMounted: true,
    defaultActiveTab: "tab1",
  },
};

export const ManyTabs: Story = {
  args: {
    items: [
      {
        id: "stake",
        label: "Stake",
        content: (
          <div className="rounded bg-primary-highlight p-4 text-accent-primary">
            Stake Content
          </div>
        ),
      },
      {
        id: "activity",
        label: "Activity",
        content: (
          <div className="rounded bg-primary-highlight p-4 text-accent-primary">
            Activity Content
          </div>
        ),
      },
      {
        id: "rewards",
        label: "Rewards",
        content: (
          <div className="rounded bg-primary-highlight p-4 text-accent-primary">
            Rewards Content
          </div>
        ),
      },
      {
        id: "faqs",
        label: "FAQs",
        content: (
          <div className="rounded bg-primary-highlight p-4 text-accent-primary">
            FAQs Content
          </div>
        ),
      },
    ],
    defaultActiveTab: "stake",
  },
};

