import { useState } from "react";
import { ActivityCardDetailItem, ActivityListItemData } from "../ActivityCard";
import { ActivityListItem } from "./ActivityListItem";
import { CollapseIcon, OpenIcon } from "../../../../components/Icons";

interface ActivityCardDetailsSectionProps {
  details: ActivityCardDetailItem[];
  optionalDetails?: ActivityCardDetailItem[];
  listItems?: {
    label: string;
    items: ActivityListItemData[];
  }[];
}

interface DetailRowProps {
  label: string | React.ReactNode;
  value: string | React.ReactNode;
  collapsible?: boolean;
  nestedDetails?: ActivityCardDetailItem[];
}

function DetailRow({ label, value, collapsible = false, nestedDetails }: DetailRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  if (collapsible) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs sm:text-sm text-accent-secondary">
              {label}
            </span>
            <button
              onClick={handleToggle}
              className="w-5 h-5 flex-shrink-0 hover:opacity-70 transition-opacity"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <CollapseIcon size={20} variant="secondary" />
              ) : (
                <OpenIcon size={20} variant="secondary" />
              )}
            </button>
          </div>
          <span className="text-xs sm:text-sm text-accent-primary font-medium text-right min-w-0 overflow-x-auto whitespace-nowrap">
            {value}
          </span>
        </div>
        {isExpanded && nestedDetails && (
          <div className="bg-surface p-3 sm:p-4 rounded space-y-3 sm:space-y-4 overflow-x-auto">
            {nestedDetails.map((detail, index) => (
              <DetailRow
                key={index}
                label={detail.label}
                value={detail.value}
                collapsible={detail.collapsible}
                nestedDetails={detail.nestedDetails}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 min-w-0 overflow-x-auto">
      <span className="text-xs sm:text-sm text-accent-secondary flex-shrink-0">
        {label}
      </span>
      <span className="text-xs sm:text-sm text-accent-primary font-medium text-right min-w-0 overflow-x-auto whitespace-nowrap">
        {value}
      </span>
    </div>
  );
}

export function ActivityCardDetailsSection({
  details,
  optionalDetails,
  listItems,
}: ActivityCardDetailsSectionProps) {
  const hasOptionalDetails = optionalDetails && optionalDetails.length > 0;
  const hasListItems = listItems && listItems.length > 0;

  return (
    <div className="space-y-3 sm:space-y-4 overflow-x-auto">
      <div className="space-y-4 sm:space-y-6">
        {details.map((detail, detailIndex) => (
          <DetailRow
            key={detailIndex}
            label={detail.label}
            value={detail.value}
            collapsible={detail.collapsible}
            nestedDetails={detail.nestedDetails}
          />
        ))}
      </div>

      {hasListItems && (
        <div className="space-y-3 sm:space-y-4">
          {listItems.map((listSection, sectionIndex) => (
            <div
              key={sectionIndex}
              className="bg-surface p-3 sm:p-4 rounded space-y-3 sm:space-y-4 overflow-x-auto"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="text-xs sm:text-sm text-accent-secondary">
                  {listSection.label}
                </span>
                <div className="flex flex-wrap gap-2">
                  {listSection.items.map((item, itemIndex) => (
                    <ActivityListItem key={item.id || itemIndex} item={item} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasOptionalDetails && (
        <div className="bg-surface p-3 sm:p-4 rounded space-y-3 sm:space-y-4 overflow-x-auto">
          {optionalDetails.map((detail, index) => (
            <DetailRow
              key={index}
              label={detail.label}
              value={detail.value}
              collapsible={detail.collapsible}
              nestedDetails={detail.nestedDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
}
