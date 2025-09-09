import { Button } from "@/components/Button";
import { Dialog, MobileDialog, DialogBody, DialogHeader } from "@/components/Dialog";
import { WINDOW_BREAKPOINT } from "@/utils/constants";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { SimpleTable } from "@/components/SimpleTable";

export interface FinalityProvider {
  name: string;
  logo_url?: string;
  bsnId: string;
  bsnLogoUrl?: string;
}

interface SimpleTableModalProps {
  headers: string[];
  data: FinalityProvider[];
}

export const SimpleTableModal = ({ headers, data }: SimpleTableModalProps) => {
  const isMobileView = useIsMobile(WINDOW_BREAKPOINT);
  const DialogComponent = isMobileView ? MobileDialog : Dialog;
  const [visible, setVisibility] = useState(false);

  const onClose = () => {
    setVisibility(false);
  };

  const tableData = [
    ...data.map((row) => [
      ...headers.map((_, cellIdx) => (
        <>
          <Avatar url={row.logo_url} alt={row.name} variant={cellIdx === 0 ? "rounded" : "circular"} size="small" />
          {row.name}
        </>
      ))
    ]),
  ];

  return (
    <>
      <Button onClick={() => setVisibility(true)}>
        Open
      </Button>
      <DialogComponent className="w-[41.25rem] max-w-full" open={visible} onClose={onClose}>
        <DialogHeader title="BSNs & Finality Providers" onClose={onClose} className="text-accent-primary" />
        <DialogBody className="mt-4 gap-4 text-accent-primary">
          <SimpleTable headers={headers} data={tableData} />
        </DialogBody>
      </DialogComponent>
    </>
  );
};
