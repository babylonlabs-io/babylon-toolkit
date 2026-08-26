import type { Meta, StoryObj } from "@storybook/react";
import { action } from "@storybook/addon-actions";

import { CoStakingRewardsSubsection } from "./CoStakingRewardsSubsection";

const meta: Meta<typeof CoStakingRewardsSubsection> = {
    title: "Widgets/Rewards/CoStakingRewardsSubsection",
    component: CoStakingRewardsSubsection,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof meta>;

const TOTAL_SYMBOL = "BBN";
const BTC_SYMBOL = "BTC";
const BABY_SYMBOL = "BBN";

export const Default: Story = {
    args: {
        totalAmount: "12,345.67",
        totalSymbol: TOTAL_SYMBOL,
        btcRewardAmount: "1,234.56",
        btcSymbol: BTC_SYMBOL,
        babyRewardAmount: "321.000001",
        babySymbol: BABY_SYMBOL,
        coStakingAmount: "100,000",
        avatarUrl: "https://placehold.co/40x40",
        onClaim: () => {
            action("claim-clicked")();
            alert("Claim clicked");
        },
        onStakeMore: () => {
            action("stake-more-clicked")();
            alert("Stake more clicked");
        },
        stakeMoreCta: "Stake 53,234 BBN to Unlock Full Rewards",
    },
};

export const WithoutCoStakingBonus: Story = {
    args: {
        totalAmount: "1,555.00",
        totalSymbol: TOTAL_SYMBOL,
        btcRewardAmount: "1,200.00",
        btcSymbol: BTC_SYMBOL,
        babyRewardAmount: "355.00",
        babySymbol: BABY_SYMBOL,
        avatarUrl: "https://placehold.co/40x40",
        onClaim: () => action("claim-clicked")(),
        stakeMoreCta: "Stake to Unlock Full Rewards",
    },
};

export const LargeNumbers: Story = {
    args: {
        totalAmount: "123,456,789.123456",
        totalSymbol: TOTAL_SYMBOL,
        btcRewardAmount: "98,765,432.987654",
        btcSymbol: BTC_SYMBOL,
        babyRewardAmount: "12,345,678.123456",
        babySymbol: BABY_SYMBOL,
        coStakingAmount: "250,000",
        avatarUrl: "https://placehold.co/40x40",
        onClaim: () => action("claim-clicked")(),
        onStakeMore: () => action("stake-more-clicked")(),
        stakeMoreCta: "Stake 100,000 BBN to Unlock Full Rewards",
    },
};

export const DisabledClaim: Story = {
    args: {
        totalAmount: "12,345.67",
        totalSymbol: TOTAL_SYMBOL,
        btcRewardAmount: "1,234.56",
        btcSymbol: BTC_SYMBOL,
        babyRewardAmount: "321.000001",
        babySymbol: BABY_SYMBOL,
        coStakingAmount: "100,000",
        avatarUrl: "https://placehold.co/40x40",
        onClaim: () => action("claim-clicked")(),
        claimDisabled: true,
        onStakeMore: () => action("stake-more-clicked")(),
        stakeMoreCta: "Stake 53,234 BBN to Unlock Full Rewards",
    },
};

export const NoAvatar: Story = {
    args: {
        totalAmount: "5,000.00",
        totalSymbol: TOTAL_SYMBOL,
        btcRewardAmount: "3,000.00",
        btcSymbol: BTC_SYMBOL,
        babyRewardAmount: "2,000.00",
        babySymbol: BABY_SYMBOL,
        coStakingAmount: "50,000",
        onClaim: () => action("claim-clicked")(),
        onStakeMore: () => action("stake-more-clicked")(),
        stakeMoreCta: "Stake 10,000 BBN to Unlock Full Rewards",
    },
};
