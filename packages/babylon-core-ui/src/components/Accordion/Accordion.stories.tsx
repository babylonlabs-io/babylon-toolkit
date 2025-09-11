import type { Meta, StoryObj } from "@storybook/react";
import { AiOutlinePlus, AiOutlineMinus } from "react-icons/ai";

import { Accordion } from "./Accordion";
import { AccordionSummary, AccordionDetails } from ".";
import { Heading } from "../Heading";
import { Text } from "../Text";

const meta: Meta<typeof Accordion> = {
  title: "Elements/Data Display/Containers/Accordion",
  component: Accordion,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: "b-text-primary",
  },
  render: (props) => (
    <Accordion {...props}>
      <AccordionSummary
        className="b-p-2"
        renderIcon={(expanded) => (expanded ? <AiOutlineMinus size={24} /> : <AiOutlinePlus size={24} />)}
      >
        <Heading variant="h6">How does Bitcoin Staking work?</Heading>
      </AccordionSummary>

      <AccordionDetails className="b-p-2" unmountOnExit>
        <Text>I don't know</Text>
      </AccordionDetails>
    </Accordion>
  ),
};
