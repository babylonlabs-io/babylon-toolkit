import { Text } from "@babylonlabs-io/core-ui";
import { PiWarningOctagonFill } from "react-icons/pi";

interface NoticeBannerProps {
  visible: boolean;
  /**
   * Operator-provided freeform notice text (from env config). Rendered
   * verbatim with line breaks preserved; never a hardcoded copy string.
   */
  message: string;
}

export function NoticeBanner({ visible, message }: NoticeBannerProps) {
  if (!visible || !message) {
    return null;
  }

  return (
    <div className="flex flex-row items-center justify-center gap-2 bg-amber-100 px-4 py-3 text-center text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      <PiWarningOctagonFill className="flex-shrink-0" />
      <Text variant="body1" className="whitespace-pre-line">
        {message}
      </Text>
    </div>
  );
}
