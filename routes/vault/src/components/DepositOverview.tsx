import { IconButton } from "@babylonlabs-io/core-ui";
import { AiOutlinePlus } from "react-icons/ai";

export function DepositOverview() {
  const handleAddDeposit = () => {
    console.log("Add deposit clicked");
  };

  return (
    <div className="flex flex-col items-center gap-8 rounded-2xl bg-primary-highlight p-6">
      <img
        src="/mascot-bitcoin.png"
        alt="Supply collateral mascot"
        className="h-[180px] w-auto"
      />
      <div className="flex flex-col gap-1 text-center">
        <h4 className="text-lg font-semibold text-accent-primary">
          Supply Collateral BTC Trustlessly
        </h4>
        <p className="text-sm text-accent-secondary">
          Enter the amount of BTC you want to deposit and select a provider to secure it.
          <br />
          Your deposit will appear here once confirmed.
        </p>
      </div>
      <IconButton
        variant="outlined"
        size="large"
        onClick={handleAddDeposit}
        aria-label="Add deposit"
      >
        <AiOutlinePlus />
      </IconButton>
    </div>
  );
}
