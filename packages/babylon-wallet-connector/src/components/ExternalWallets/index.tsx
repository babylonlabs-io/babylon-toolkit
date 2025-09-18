import { Text } from "@babylonlabs-io/core-ui";
import { useClickWallet, useWalletListWithIsInstall } from "@tomo-inc/wallet-connect-sdk";
import { twJoin } from "tailwind-merge";

interface TomoWidgetProps {
  chainName: "bitcoin" | "cosmos";
  onError?: (e: Error) => void;
}

export const ExternalWallets = ({ chainName, onError }: TomoWidgetProps) => {
  const selectWallet = useClickWallet();
  const wallets = useWalletListWithIsInstall(chainName);

  const handleClick = async (wallet: any) => {
    try {
      await selectWallet(wallet);
    } catch (e: any) {
      onError?.(e);
    }
  };

  return (
    <div className="pt-10 text-accent-primary">
      <Text className="mb-4">More wallets with Tomo Connect</Text>

      <div className="grid grid-cols-3 items-center justify-between gap-6 rounded border border-secondary-strokeLight p-6 md:grid-cols-7">
        {(wallets || []).map((wallet: any) => (
          <button
            disabled={!wallet.isInstall}
            className={twJoin("flex flex-col items-center gap-2.5", wallet.isInstall ? "opacity-100" : "opacity-50")}
            key={wallet.id}
            onClick={() => handleClick(wallet)}
            data-testid={`tomo-wallet-option-${chainName}_${wallet.name?.toLowerCase()}`}
          >
            <img className="size-10 object-contain" src={wallet.img} alt={wallet.name} />

            <Text className="whitespace-nowrap leading-none" variant="body2">
              {wallet.name}
            </Text>
          </button>
        ))}
      </div>
    </div>
  );
};
