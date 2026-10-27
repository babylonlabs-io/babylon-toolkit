import { Dialog, type DialogProps } from "./Dialog";

export type MobileDialogProps = Omit<DialogProps, "mobile" | "hasBackdrop" | "dialogClassName">;

export const MobileDialog = (props: MobileDialogProps) => <Dialog {...props} mobile />;
