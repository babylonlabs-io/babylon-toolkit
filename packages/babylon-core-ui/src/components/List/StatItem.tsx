import { useEffect, useId, useState, type JSX } from "react";
import { AiOutlineInfoCircle } from "react-icons/ai";

import { Button } from "@/components/Button";
import { ListItem, type ListItemProps } from "@/components/List";
import { MobileDialog } from "@/components/Dialog";
import { useIsMobile } from "@/hooks";
import { Popover } from "@/components/Popover";

export interface StatItemProps extends Omit<ListItemProps, "value" | "suffix"> {
    hidden?: boolean;
    loading?: boolean;
    tooltip?: string | JSX.Element;
    loadingStyle?: "spinner" | "spinner-and-value";
    value: string | JSX.Element;
}

export const StatItem = ({
    hidden = false,
    loading,
    title,
    value,
    tooltip,
    loadingStyle = "spinner",
    ...props
}: StatItemProps) => {
    const tooltipId = useId();
    const isMobileView = useIsMobile();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<Element | null>(null);

    useEffect(() => {
        if (!isMobileView && dialogOpen) {
            setDialogOpen(false);
        }
    }, [isMobileView, dialogOpen]);

    if (hidden) return null;

    const spinnerEl = (
        <div className="inline-flex items-center gap-2">
            <span className="loader size-5" />
            {loadingStyle === "spinner-and-value" && <span className="opacity-50">{value}</span>}
        </div>
    );

    const suffixEl = tooltip ? (
        isMobileView ? (
            <>
                <span className="block size-5 cursor-pointer text-xs" onClick={() => setDialogOpen(true)}>
                    <AiOutlineInfoCircle size={20} />
                </span>
                <MobileDialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
                    <div className="px-4 py-2 text-accent-primary">{tooltip}</div>
                    <div className="p-4">
                        <Button variant="contained" fluid onClick={() => setDialogOpen(false)}>
                            Done
                        </Button>
                    </div>
                </MobileDialog>
            </>
        ) : (
            <>
                <span
                    className="block size-5 cursor-pointer text-xs"
                    onMouseEnter={(e) => setAnchorEl(e.currentTarget)}
                    onMouseLeave={() => setAnchorEl(null)}
                    aria-describedby={tooltipId}
                >
                    <AiOutlineInfoCircle size={20} />
                </span>
                <Popover open={!!anchorEl} anchorEl={anchorEl} placement="top" offset={[0, 8]}>
                    <div className="tooltip-wrap">{tooltip}</div>
                </Popover>
            </>
        )
    ) : undefined;

    return (
        <ListItem
            {...props}
            title={title}
            value={loading ? spinnerEl : value}
            suffix={suffixEl}
        />
    );
};
