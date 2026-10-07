import { COPY } from "@/copy";

const ICON_STROKE_WIDTH = 2;

function FileProtectionIcon() {
  return (
    <svg
      width="27"
      height="24"
      viewBox="0 0 27 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M22.5 11.5V7L17.4375 2H5.625C5.00368 2 4.5 2.44771 4.5 3V21C4.5 21.5523 5.00368 22 5.625 22H12.375" />
      <path d="M15.1875 15.6C15.1875 15.0667 19.125 14 19.125 14C19.125 14 23.0625 15.0667 23.0625 15.6C23.0625 19.8667 19.125 22 19.125 22C19.125 22 15.1875 19.8667 15.1875 15.6Z" />
      <path d="M16.875 2V7H22.5" />
    </svg>
  );
}

export function ArtifactReminderCard() {
  const { title, subtitle, body } =
    COPY.deposit.recoveryArtifacts.phoneReminder;

  return (
    <div
      role="note"
      className="flex w-full flex-col gap-2 rounded-lg border-l-4 border-secondary-main bg-background-contrast bg-gradient-to-r from-secondary-main/10 to-secondary-main/10 p-3"
    >
      <div className="flex items-center gap-2">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary-main p-2.5 text-accent-contrast"
        >
          <FileProtectionIcon />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="text-base leading-6 tracking-0.15 text-accent-primary">
            {title}
          </span>
          <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
            {subtitle}
          </span>
        </div>
      </div>
      <p className="break-words text-sm leading-[1.5] tracking-0.15 text-accent-secondary">
        {body}
      </p>
    </div>
  );
}
