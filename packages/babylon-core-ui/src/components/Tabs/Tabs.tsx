import { ReactNode, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export type TabsVariant = "default" | "simple";

export interface TabsProps {
  items: TabItem[];
  defaultActiveTab?: string;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
  keepMounted?: boolean;
  variant?: TabsVariant;
}

export const Tabs = ({
  items,
  defaultActiveTab,
  activeTab: controlledActiveTab,
  onTabChange,
  className,
  keepMounted,
  variant = "default",
}: TabsProps) => {
  const [internalActiveTab, setInternalActiveTab] = useState(
    defaultActiveTab || items[0]?.id || "",
  );

  const activeTab = controlledActiveTab ?? internalActiveTab;

  // Synchronizes the internal active tab state with the controlledActiveTab prop.
  useEffect(() => {
    if (controlledActiveTab !== undefined) {
      setInternalActiveTab(controlledActiveTab);
    }
  }, [controlledActiveTab]);

  const handleTabClick = (tabId: string) => {
    if (onTabChange) {
      onTabChange(tabId);
    } else {
      setInternalActiveTab(tabId);
    }
  };

  const activeContent = items.find((item) => item.id === activeTab)?.content;

  // Variant-specific styles
  const isSimple = variant === "simple";

  return (
    <div className={twMerge("w-full", className)}>
      <div className="mb-6 flex w-full gap-2" role="tablist">
        {items.map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            aria-selected={activeTab === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={activeTab === item.id ? 0 : -1}
            className={twMerge(
              "transition-colors duration-200",
              isSimple
                ? twMerge(
                    "px-4 py-2 text-lg font-normal",
                    activeTab === item.id
                      ? "text-accent-primary"
                      : "text-accent-secondary",
                  )
                : twMerge(
                    "rounded px-4 py-2 text-accent-primary",
                    activeTab === item.id
                      ? "bg-secondary-highlight"
                      : "bg-transparent",
                  ),
            )}
            onClick={() => handleTabClick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      
      {/* Divider for simple variant */}
      {isSimple && (
        <div className="w-full h-[1px] bg-secondary-strokeDark mb-6 -mt-6" />
      )}

      {keepMounted ? (
        <div className="mt-6">
          {items.map((item) => (
            <div
              key={item.id}
              role="tabpanel"
              id={`panel-${item.id}`}
              aria-labelledby={`tab-${item.id}`}
              className={twMerge(activeTab === item.id ? "" : "hidden")}
            >
              {item.content}
            </div>
          ))}
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeContent}
        </div>
      )}
    </div>
  );
};

