import { SubSection } from "../../../components/SubSection";

import { useMemo } from "react";

import { CounterButton } from "../../../components/CounterButton/CounterButton";
import { ProvidersList, ProviderItem } from "../../../components/ProvidersList/ProvidersList";

interface Props {
  max: number;
  items: ProviderItem[];
  onAdd: () => void;
  onRemove: (bsnId?: string) => void;
}

export function FinalityProviderSubsection({ max, items = [], onAdd, onRemove }: Props) {
  const count = useMemo(() => items.length, [items]);

  const allowsMultipleBsns = max > 1;
  const actionText = allowsMultipleBsns ? "Add BSN and Finality Provider" : "Add Finality Provider";

  return (
    <SubSection>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-row">
          <div className="flex w-full flex-row content-center items-center justify-between font-normal">
            <span className="text-sm sm:text-base">{actionText}</span>
            <CounterButton counter={count} max={max} onAdd={onAdd} />
          </div>
        </div>
        {count > 0 && <ProvidersList items={items} onRemove={onRemove} />}
      </div>
    </SubSection>
  );
}
