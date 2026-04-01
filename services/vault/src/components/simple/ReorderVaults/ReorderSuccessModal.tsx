import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
} from "@babylonlabs-io/core-ui";

import { REORDER_SUCCESS_TEXT, REORDER_SUCCESS_TITLE } from "./constants";
import icon from "./reorder.svg";

interface ReorderSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReorderSuccessModal({
  isOpen,
  onClose,
}: ReorderSuccessModalProps) {
  return (
    <ResponsiveDialog open={isOpen} onClose={onClose}>
      <DialogHeader title={REORDER_SUCCESS_TITLE} onClose={onClose} />
      <DialogBody>
        <img src={icon} alt="Success" className="mx-auto my-3" />
        <p className="py-3 text-center text-accent-secondary">
          {REORDER_SUCCESS_TEXT}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="contained"
          color="secondary"
          size="large"
          fluid
          onClick={onClose}
        >
          Done
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
