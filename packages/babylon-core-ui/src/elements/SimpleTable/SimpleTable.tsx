import { SubSection } from "@/components/SubSection";
import { Text } from "@/components/Text";
import { twJoin } from "tailwind-merge";
import { ReactNode } from "react";

interface TableProps {
  data: ReactNode[][];
  headers: string[];
  className?: string;
}

export const SimpleTable = ({ data, headers, className }: TableProps) => {
  const gridStyle = {
    gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
  };

  return (
    <SubSection className={twJoin("p-6 pt-4", className)}>
      <div className="flex flex-col w-full text-sm">
        <div
          className="items-center gap-4 pb-4 grid text-accent-secondary"
          style={gridStyle}
        >
          {headers.map((header, idx) => (
            <Text key={`header-${idx}`} variant="caption" className="px-2.5">
              {header}
            </Text>
          ))}
        </div>

        <div className="max-h-[calc(100vh-20rem)] overflow-y-auto">
          {data.map((row, rowIdx) => (
            <div
              key={`row-${rowIdx}`}
              className="items-center gap-4 rounded py-1 grid"
              style={gridStyle}
            >
              {headers.map((_, cellIdx) => (
                <div
                  key={`cell-${rowIdx}-${cellIdx}`}
                  className="flex w-full items-center gap-2 py-1 px-2.5"
                >
                  {row[cellIdx]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </SubSection>
  );
};