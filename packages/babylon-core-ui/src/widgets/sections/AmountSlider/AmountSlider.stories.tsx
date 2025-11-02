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
          currencyIcon="/images/btc.png"
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
          currencyIcon="/images/usdc.png"
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
          currencyIcon="/images/btc.png"
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

export const WithSteps: Story = {
  render: () => {
    const [amount, setAmount] = useState(0);
    const [_, setSelectedSteps] = useState<number[]>([]);
    
    const steps = [
      { value: 0, label: "0%" },
      { value: 1.25, label: "25%" },
      { value: 2.5, label: "50%" },
      { value: 3.75, label: "75%" },
      { value: 5, label: "100%" },
    ];
    
    return (
      <div className="w-[600px]">
        <AmountSlider
          amount={amount}
          currencyIcon="/images/btc.png"
          currencyName="Bitcoin"
          onAmountChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          balanceDetails={{
            balance: 5.0,
            symbol: "BTC",
            price: 112694.16,
            displayUSD: true,
          }}
          sliderValue={amount}
          sliderMin={0}
          sliderMax={5}
          sliderSteps={steps}
          onSliderChange={setAmount}
          onSliderStepsChange={setSelectedSteps}
          sliderVariant="primary"
          leftField={{
            label: "Max",
            value: "5.0000 BTC",
          }}
          onMaxClick={() => setAmount(5)}
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

export const WithCustomBackgroundColor: Story = {
  render: () => {
    const [amount1, setAmount1] = useState(0);
    const [amount2, setAmount2] = useState(0);
    const [amount3, setAmount3] = useState(0);
    const [amount4, setAmount4] = useState(0);
    const [amount5, setAmount5] = useState(0);
    
    return (
      <div className="w-[600px] space-y-8">
        <div>
          <h3 className="mb-4 text-sm font-medium text-accent-secondary">
            Default (no custom colors)
          </h3>
          <AmountSlider
            amount={amount1}
            currencyIcon="/images/btc.png"
            currencyName="Bitcoin"
            onAmountChange={(e) => setAmount1(parseFloat(e.target.value) || 0)}
            balanceDetails={{
              balance: 10.0,
              symbol: "BTC",
              price: 112694.16,
              displayUSD: true,
            }}
            sliderValue={amount1}
            sliderMin={0}
            sliderMax={10}
            sliderStep={0.01}
            onSliderChange={setAmount1}
            sliderVariant="primary"
            leftField={{
              label: "Max",
              value: "10.0000 BTC",
            }}
            onMaxClick={() => setAmount1(10)}
            rightField={{
              value: `$${(amount1 * 112694.16).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })} USD`,
            }}
          />
        </div>
        
        <div>
          <h3 className="mb-4 text-sm font-medium text-accent-secondary">
            Blue active color (#1976D2) - lighter background auto-generated (only in light mode)
          </h3>
          <AmountSlider
            amount={amount2}
            currencyIcon="/images/btc.png"
            currencyName="Bitcoin"
            onAmountChange={(e) => setAmount2(parseFloat(e.target.value) || 0)}
            balanceDetails={{
              balance: 10.0,
              symbol: "BTC",
              price: 112694.16,
              displayUSD: true,
            }}
            sliderValue={amount2}
            sliderMin={0}
            sliderMax={10}
            sliderStep={0.01}
            onSliderChange={setAmount2}
            sliderVariant="primary"
            sliderActiveColor="#1976D2"
            leftField={{
              label: "Max",
              value: "10.0000 BTC",
            }}
            onMaxClick={() => setAmount2(10)}
            rightField={{
              value: `$${(amount2 * 112694.16).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })} USD`,
            }}
          />
        </div>
        
        <div>
          <h3 className="mb-4 text-sm font-medium text-accent-secondary">
            Green active color (#2E7D32) - lighter background auto-generated (only in light mode)
          </h3>
          <AmountSlider
            amount={amount3}
            currencyIcon="/images/btc.png"
            currencyName="Bitcoin"
            onAmountChange={(e) => setAmount3(parseFloat(e.target.value) || 0)}
            balanceDetails={{
              balance: 10.0,
              symbol: "BTC",
              price: 112694.16,
              displayUSD: true,
            }}
            sliderValue={amount3}
            sliderMin={0}
            sliderMax={10}
            sliderStep={0.01}
            onSliderChange={setAmount3}
            sliderVariant="primary"
            sliderActiveColor="#2E7D32"
            leftField={{
              label: "Max",
              value: "10.0000 BTC",
            }}
            onMaxClick={() => setAmount3(10)}
            rightField={{
              value: `$${(amount3 * 112694.16).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })} USD`,
            }}
          />
        </div>
        
        <div>
          <h3 className="mb-4 text-sm font-medium text-accent-secondary">
            Explicit background color override (#E3F2FD) - only applies in light mode
          </h3>
          <AmountSlider
            amount={amount4}
            currencyIcon="/images/btc.png"
            currencyName="Bitcoin"
            onAmountChange={(e) => setAmount4(parseFloat(e.target.value) || 0)}
            balanceDetails={{
              balance: 10.0,
              symbol: "BTC",
              price: 112694.16,
              displayUSD: true,
            }}
            sliderValue={amount4}
            sliderMin={0}
            sliderMax={10}
            sliderStep={0.01}
            onSliderChange={setAmount4}
            sliderVariant="primary"
            sliderActiveColor="#1976D2"
            sliderBackgroundColor="#E3F2FD"
            leftField={{
              label: "Max",
              value: "10.0000 BTC",
            }}
            onMaxClick={() => setAmount4(10)}
            rightField={{
              value: `$${(amount4 * 112694.16).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })} USD`,
            }}
          />
        </div>
        
        <div>
          <h3 className="mb-4 text-sm font-medium text-accent-secondary">
            Purple active color (#7B1FA2) - lighter background auto-generated (only in light mode)
          </h3>
          <AmountSlider
            amount={amount5}
            currencyIcon="/images/btc.png"
            currencyName="Bitcoin"
            onAmountChange={(e) => setAmount5(parseFloat(e.target.value) || 0)}
            balanceDetails={{
              balance: 10.0,
              symbol: "BTC",
              price: 112694.16,
              displayUSD: true,
            }}
            sliderValue={amount5}
            sliderMin={0}
            sliderMax={10}
            sliderStep={0.01}
            onSliderChange={setAmount5}
            sliderVariant="primary"
            sliderActiveColor="#7B1FA2"
            leftField={{
              label: "Max",
              value: "10.0000 BTC",
            }}
            onMaxClick={() => setAmount5(10)}
            rightField={{
              value: `$${(amount5 * 112694.16).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })} USD`,
            }}
          />
        </div>
      </div>
    );
  },
};

