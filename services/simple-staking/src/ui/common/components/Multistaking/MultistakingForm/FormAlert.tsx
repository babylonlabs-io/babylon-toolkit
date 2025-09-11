import { MdErrorOutline } from "react-icons/md";

import { Alert } from "@/ui/common/components/Alerts/Alert";

export const FormAlert = ({
  title,
  message,
}: {
  title?: string;
  message?: string | React.ReactNode;
}) => {
  if (!title) {
    return null;
  }

  return (
    <div className="pt-2">
      <Alert icon={<MdErrorOutline />} title={<strong>{title}</strong>}>
        {message}
      </Alert>
    </div>
  );
};
