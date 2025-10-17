import type { Meta, StoryObj } from "@storybook/react";
import { AmountSlider } from "./AmountSlider";
import { useState } from "react";

const meta: Meta<typeof AmountSlider> = {
  title: "Widgets/Sections/AmountSlider",
  component: AmountSlider,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Interactive story with state management
export const Default: Story = {
  render: () => {
    const [amount, setAmount] = useState(0);
    
    return (
      <div className="w-[600px]">
        <AmountSlider
          amount={amount}
          currencyIcon="/btc.png"
          currencyName="Bitcoin"
          onAmountChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          balanceDetails={{
            balance: 10.0,
            symbol: "BTC",
            price: 112694.16,
            displayUSD: true,
          }}
          sliderValue={amount}
          sliderMin={0}
          sliderMax={10}
          sliderStep={0.01}
          onSliderChange={setAmount}
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: "10.0000 BTC",
          }}
          onMaxClick={() => setAmount(10)}
          rightField={{
            value: `$${(amount * 112694.16).toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })} USD`,
          }}
        />
      </div>
    );
  },
};

export const RainbowVariant: Story = {
  render: () => {
    const [amount, setAmount] = useState(0);
    
    return (
      <div className="w-[600px]">
        <AmountSlider
          amount={amount}
          currencyIcon="/usdc.png"
          currencyName="USDC"
          onAmountChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          balanceDetails={{
            balance: 100000,
            symbol: "USDC",
            displayUSD: false,
          }}
          sliderValue={amount}
          sliderMin={0}
          sliderMax={100000}
          sliderStep={100}
          onSliderChange={setAmount}
          sliderVariant="rainbow"
          leftField={{
            label: "Max",
            value: "100,000 USDC",
          }}
          onMaxClick={() => setAmount(100000)}
          rightField={{
            value: `$${amount.toLocaleString('en-US', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })} USD`,
          }}
        />
      </div>
    );
  },
};

export const WithCustomActiveColor: Story = {
  render: () => {
    const [amount, setAmount] = useState(0);
    
    return (
      <div className="w-[600px]">
        <AmountSlider
          amount={amount}
          currencyIcon="/btc.png"
          currencyName="Bitcoin"
          onAmountChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          sliderValue={amount}
          sliderMin={0}
          sliderMax={5}
          sliderStep={0.01}
          onSliderChange={setAmount}
          sliderVariant="primary"
          sliderActiveColor="#0B53BF"
          leftField={{
            label: "Max",
            value: "5.0000 BTC",
          }}
          onMaxClick={() => setAmount(5)}
        />
      </div>
    );
  },
};

