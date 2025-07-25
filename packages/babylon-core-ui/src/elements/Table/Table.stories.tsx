import type { Meta, StoryObj } from "@storybook/react";
import { Table } from "./Table";
import { Avatar } from "../../components/Avatar/Avatar";

const meta: Meta<typeof Table> = {
    component: Table,
    tags: ["autodocs"],
    parameters: {
        layout: "centered",
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

const BsnAvatar = (url: string, alt: string) => (
    <Avatar url={url} alt={alt} size="small" variant="circular" />
);

export const SinglePair: Story = {
    render: () => (
        <Table
            data={[
                [
                    "BSNs",
                    "Finality Provider",
                ],
                [
                    <>
                        {BsnAvatar("/images/fps/pumpbtc.jpeg", "Babylon")} Babylon
                    </>,
                    <>
                        {BsnAvatar("/images/fps/lombard.jpeg", "Lombard")} Lombard Protocol
                    </>,
                ],
            ]}
        />
    ),
};

export const MultiplePairs: Story = {
    render: () => (
        <Table
            data={[
                ["BSNs", "Finality Provider"],
                [
                    <>
                        {BsnAvatar("/images/fps/pumpbtc.jpeg", "Babylon")} Babylon
                    </>,
                    <>
                        {BsnAvatar("/images/fps/lombard.jpeg", "Lombard")} Lombard Protocol
                    </>,
                ],
                [
                    <>
                        {BsnAvatar("/images/fps/solv.jpeg", "Solv")} Solv
                    </>,
                    <>
                        {BsnAvatar("/images/fps/lombard.jpeg", "Provider X")} Provider X
                    </>,
                ],
            ]}
        />
    ),
};

export const LongNames: Story = {
    render: () => (
        <Table
            data={[
                ["BSNs", "Finality Provider"],
                [
                    <>
                        {BsnAvatar("/images/fps/pumpbtc.jpeg", "VeryLongBSNName")} Very Long Name for Babylon Network That Might Wrap
                    </>,
                    <>
                        {BsnAvatar("/images/fps/lombard.jpeg", "LongFPName")} Very Long Finality Provider Name That Should Handle Text Overflow Correctly
                    </>,
                ],
                [
                    <>
                        {BsnAvatar("/images/fps/solv.jpeg", "AnotherLongBSNName")} Another Extremely Long BSN Name to Test Wrapping Capability
                    </>,
                    <>
                        {BsnAvatar("/images/fps/lombard.jpeg", "AnotherLongFPName")} Another Really Long Finality Provider Name for Layout Testing
                    </>,
                ],
            ]}
        />
    ),
}; 