import { truncateHash } from "@/utils/addressUtils";

interface VaultDetailRowsProps {
  date: string;
  txHash: string;
}

export function VaultDetailRows({ date, txHash }: VaultDetailRowsProps) {
  return (
    <>
      {/* Date row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Date</span>
        <span className="text-sm text-accent-primary">{date}</span>
      </div>

      {/* Transaction hash row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Transaction Hash</span>
        <span className="font-mono text-sm text-accent-primary">
          {truncateHash(txHash)}
        </span>
      </div>
    </>
  );
}
