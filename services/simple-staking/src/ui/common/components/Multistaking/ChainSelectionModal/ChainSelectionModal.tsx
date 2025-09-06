import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  SubSection,
  Text,
} from "@babylonlabs-io/core-ui";
import { PropsWithChildren, useMemo } from "react";
import { MdOutlineInfo } from "react-icons/md";
import { twMerge } from "tailwind-merge";

import { ResponsiveDialog } from "@/ui/common/components/Modals/ResponsiveDialog";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { chainLogos } from "@/ui/common/constants";
import { Bsn } from "@/ui/common/types/bsn";

const BSN_ID = getNetworkConfigBBN().chainId;

interface ChainButtonProps extends PropsWithChildren {
  className?: string;
  disabled?: boolean;
  logo?: string;
  title?: string | JSX.Element;
  alt?: string;
  selected?: boolean;
  onClick?: () => void;
}

const ChainButton = ({
  className,
  disabled,
  title,
  logo,
  selected,
  onClick,
}: ChainButtonProps) => (
  <Text
    disabled={disabled}
    as="button"
    className={twMerge(
      "w-full rounded border bg-secondary-highlight px-6 py-[14px] pl-[14px]",
      selected ? "border-[#CE6533]" : "border-transparent",
      disabled
        ? "pointer-events-none cursor-default opacity-50"
        : "cursor-pointer",
      className,
    )}
    onClick={onClick}
  >
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center text-base">
        {logo && (
          <img
            src={logo}
            alt="bitcoin"
            className="mr-2 max-h-[40px] max-w-[40px] rounded-full"
          />
        )}
        {title}
      </div>
    </div>
  </Text>
);

interface ChainSelectionModalProps {
  open: boolean;
  loading?: boolean;
  activeBsnId?: string;
  selectedBsns?: Record<string, string>;
  bsns?: Bsn[];
  onNext: () => void;
  onClose: () => void;
  onSelect: (bsnId: string) => void;
}

export const ChainSelectionModal = ({
  bsns = [],
  open,
  loading,
  activeBsnId,
  selectedBsns = {},
  onSelect,
  onNext,
  onClose,
}: ChainSelectionModalProps) => {
  const babylonBsn = useMemo(
    () => bsns.find((bsn) => bsn.id === BSN_ID),
    [bsns],
  );
  const externalBsns = useMemo(
    () => bsns.filter((bsn) => bsn.id !== BSN_ID),
    [bsns],
  );
  const isBabylonSelected = babylonBsn
    ? Boolean(selectedBsns[babylonBsn.id])
    : false;

  return (
    <ResponsiveDialog open={open} onClose={onClose} className="w-[52rem]">
      <DialogHeader
        title="Select Babylon Secured Network"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="mb-4 mt-4 flex flex-col text-accent-primary">
        <div>
          Bitcoin Supercharged Networks (BSNs) are Proof-of-Stake systems
          secured by Bitcoin staking. Select a network to delegate your stake.
        </div>
        <div className="mt-10 flex max-h-[350px] flex-col gap-2 overflow-y-auto">
          {loading && <div>Loading...</div>}
          {babylonBsn && (
            <ChainButton
              logo={chainLogos.babylon}
              title={babylonBsn.name}
              selected={activeBsnId === babylonBsn.id}
              disabled={Boolean(selectedBsns[babylonBsn.id])}
              onClick={() => onSelect(babylonBsn.id)}
            />
          )}
          {externalBsns.map((bsn) => (
            <ChainButton
              key={bsn.id}
              logo={chainLogos[bsn.id] || chainLogos.placeholder}
              title={bsn.name}
              selected={activeBsnId === bsn.id}
              disabled={Boolean(selectedBsns[bsn.id]) || !isBabylonSelected}
              onClick={() => onSelect(bsn.id)}
            />
          ))}
        </div>
        {!isBabylonSelected && (
          <SubSection className="mt-4 flex-row gap-3 rounded text-base text-[#387085]">
            <div>
              <MdOutlineInfo size={22} />
            </div>
            <div>
              Babylon Genesis must be the first BSN you add before selecting
              others. Once added, you can choose additional BSNs to multi-stake.
            </div>
          </SubSection>
        )}
      </DialogBody>

      <DialogFooter className="flex justify-end">
        {activeBsnId && selectedBsns[activeBsnId] ? (
          <Button
            variant="contained"
            onClick={onClose}
            disabled={activeBsnId === undefined}
          >
            Done
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={onNext}
            disabled={activeBsnId === undefined}
          >
            Next
          </Button>
        )}
      </DialogFooter>
    </ResponsiveDialog>
  );
};
