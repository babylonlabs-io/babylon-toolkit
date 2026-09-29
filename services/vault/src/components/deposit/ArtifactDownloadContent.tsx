import { Loader } from "@babylonlabs-io/core-ui";

import { ArtifactModalIcon } from "@/components/deposit/ArtifactModalIcon";
import { ProgressBar } from "@/components/simple/DepositProgressView/ProgressBar";
import { COPY } from "@/copy";

// Decimal (SI) units, matching the design's "742 MB / 1.00 GB" presentation
// and the "~1 GB" card copy.
const DECIMAL_UNIT_STEP = 1000;
const BYTES_PER_KB = DECIMAL_UNIT_STEP;
const BYTES_PER_MB = BYTES_PER_KB * DECIMAL_UNIT_STEP;
const BYTES_PER_GB = BYTES_PER_MB * DECIMAL_UNIT_STEP;

// Geometry of the 40px ring: a circle inset by half the stroke so the
// stroke sits inside the box, and its circumference as the dash length.
const RING_SIZE = 40;
const RING_STROKE_WIDTH = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE_WIDTH) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Unit rollover keys off the ROUNDED value so e.g. 999.5 MB renders
// "1.00 GB", never "1000 MB".
function formatBytes(bytes: number): string {
  const megabytes = Math.round(bytes / BYTES_PER_MB);
  if (megabytes >= DECIMAL_UNIT_STEP) {
    return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
  }
  const kilobytes = Math.round(bytes / BYTES_PER_KB);
  if (kilobytes >= DECIMAL_UNIT_STEP) {
    return `${megabytes} MB`;
  }
  return `${kilobytes} KB`;
}

function ProgressRing({ percent }: { percent: number }) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        // The linear ProgressBar above already announces the same value.
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE_WIDTH}
          className="stroke-secondary-strokeLight"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent)}
          className="stroke-secondary-main"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs leading-none text-accent-primary">
        {Math.round(percent * 100)}%
      </span>
    </div>
  );
}

interface ArtifactDownloadContentProps {
  receivedBytes: number;
  /** 0 until the transfer reports a Content-Length. */
  totalBytes: number;
  /** The hook's status line, shown while the total is still unknown. */
  status: string;
}

/**
 * Body of the activate dialog while recovery artifacts stream: its own icon,
 * title and description, the transfer's progress bar and the byte/percent
 * card. Replaces the activation body for the duration of the download.
 */
export function ArtifactDownloadContent({
  receivedBytes,
  totalBytes,
  status,
}: ArtifactDownloadContentProps) {
  // Clamp to total so a gzip'd Content-Length or an underestimated fallback
  // can't render "1.40 GB / 1.30 GB" or overshoot the bar.
  const percent = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col items-center gap-10">
        <ArtifactModalIcon variant="downloading" />
        <div className="flex w-full flex-col items-center gap-6">
          <h2 className="text-center text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary">
            {COPY.deposit.activateConfirmation.downloadingTitle}
          </h2>
          <p className="text-center text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-secondary">
            {COPY.deposit.activateConfirmation.downloadingBody}
          </p>
        </div>
      </div>

      {totalBytes > 0 ? (
        <>
          <ProgressBar percent={percent} color="rgb(var(--success-bright))" />
          <div className="flex flex-row items-center gap-4 rounded-lg border border-secondary-strokeLight bg-background-secondary p-4">
            <ProgressRing percent={percent} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
                {`${formatBytes(Math.min(receivedBytes, totalBytes))} / `}
                <span className="text-accent-secondary">
                  {formatBytes(totalBytes)}
                </span>
              </span>
              <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
                {COPY.deposit.recoveryArtifacts.doNotCloseHint}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-secondary-strokeLight bg-background-secondary px-4 text-accent-primary">
          <Loader size={16} />
          <span className="text-sm leading-[1.43] tracking-[0.17px]">
            {status || COPY.deposit.recoveryArtifacts.downloadingButton}
          </span>
        </div>
      )}
    </div>
  );
}
