import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { Text } from "@/components/Text";
import { Button } from "@/components/Button";

import { Popover } from "./Popover";

const meta: Meta<typeof Popover> = {
  title: "Components/Containers/Overlays/Popover",
  component: Popover,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placement: "bottom-start",
    children: (
      <Text variant="body1" className="text-accent-primary">
        The content of the Popover
      </Text>
    ),
  },
  render: (props) => {
    const [open, setOpen] = useState(props.open);
    const [anchorEl, setAnchorEl] = useState<Element | null>();

    return (
      <>
        <Button
          ref={setAnchorEl}
          onClick={() => {
            setOpen((state: boolean) => !state);
          }}
        >
          Show popover
        </Button>
        <Popover
          {...props}
          open={open}
          anchorEl={anchorEl}
          onClickOutside={() => {
            setOpen(false);
          }}
        />
      </>
    );
  },
};
