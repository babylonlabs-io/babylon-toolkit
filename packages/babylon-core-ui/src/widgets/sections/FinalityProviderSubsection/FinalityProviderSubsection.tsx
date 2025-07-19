import { SubSection } from "../../../components/SubSection";

import { useMemo } from "react";

import { CounterButton } from "../../../components/CounterButton/CounterButton";
import { ProvidersList, ProviderItem } from "../../../elements/ProvidersList/ProvidersList";

interface Props {
  max: number;
  items: ProviderItem[];
  actionText: string;
  onAdd: () => void;
  onRemove: (id?: string) => void;
}

export function FinalityProviderSubsection({ max, items = [], actionText, onAdd, onRemove }: Props) {
  const count = useMemo(() => items.length, [items]);

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
