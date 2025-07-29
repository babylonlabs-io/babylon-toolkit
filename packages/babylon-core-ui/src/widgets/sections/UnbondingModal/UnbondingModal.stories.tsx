import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { UnbondingModal } from "./UnbondingModal";
import { ScrollLocker } from "@/context/Dialog.context";
import { Button } from "@/components/Button";

const meta: Meta<typeof UnbondingModal> = {
    component: UnbondingModal,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        reward: {
            amount: "",
            currencyIcon: "/images/fps/lombard.jpeg",
            currencyName: "BTC",
            placeholder: "Enter Amount",
            displayBalance: true,
            balanceDetails: {
                balance: "1.5",
                symbol: "BTC",
                price: 65000,
                displayUSD: true,
                decimals: 8,
            },
            min: "0",
            step: "any",
            chainName: "Bitcoin Network",
            stakedAmount: "1.2",
            stakedTokenName: "BTC",
        },
        amountUsd: "$0.00",
        warningText: "Once the unstaking period begins:\n• You will not receive staking rewards\n• It will take 50 hours for the amount to be liquid\n• But you will be able to cancel the unstaking process anytime, as this chain currently supports the function",
        actionButtonText: "Unbond",
        onActionClick: () => alert("Unbond clicked!"),
    },
    render: (props) => {
        const [visible, setVisibility] = useState(false);

        return (
            <ScrollLocker>
                <Button
                    onClick={() => {
                        setVisibility(true);
                    }}
                >
                    Open Unbonding Modal
                </Button>

                <UnbondingModal
                    reward={props.reward}
                    amountUsd={props.amountUsd}
                    warningText={props.warningText}
                    actionButtonText={props.actionButtonText}
                    onActionClick={props.onActionClick}
                    open={visible}
                    onClose={() => {
                        setVisibility(false);
                    }}
                />
            </ScrollLocker>
        );
    },
};

export const BABYUnbonding: Story = {
    args: {
        title: "Unbond Babylon Labs 0",
        description: "Choose how much BABY you'd like to unbond from your current delegation.\nUnbonded tokens will enter a waiting period before they become available to withdraw. Your remaining stake will continue earning rewards.",
        reward: {
            amount: "",
            currencyIcon: "/images/fps/lombard.jpeg",
            currencyName: "BABY",
            placeholder: "Enter Amount",
            displayBalance: true,
            balanceDetails: {
                balance: "1000",
                symbol: "BABY",
                price: 0.05,
                displayUSD: true,
                decimals: 18,
            },
            min: "0",
            step: "any",
            stakedAmount: "30",
            stakedTokenName: "BABY",
        },
        amountUsd: "$0.00",
        warningText: "Once the unstaking period begins:\n• You will not receive staking rewards\n• It will take 50 hours for the amount to be liquid\n• But you will be able to cancel the unstaking process anytime, as this chain currently supports the function",
        actionButtonText: "Unbond BABY",
        onActionClick: () => alert("Unbond BABY clicked!"),
    },
    render: (props) => {
        const [visible, setVisibility] = useState(false);

        return (
            <ScrollLocker>
                <Button
                    onClick={() => {
                        setVisibility(true);
                    }}
                >
                    Open Unbonding Modal with Title & Description
                </Button>

                <UnbondingModal
                    title={props.title}
                    description={props.description}
                    reward={props.reward}
                    amountUsd={props.amountUsd}
                    warningText={props.warningText}
                    actionButtonText={props.actionButtonText}
                    onActionClick={props.onActionClick}
                    open={visible}
                    onClose={() => {
                        setVisibility(false);
                    }}
                />
            </ScrollLocker>
        );
    },
};
