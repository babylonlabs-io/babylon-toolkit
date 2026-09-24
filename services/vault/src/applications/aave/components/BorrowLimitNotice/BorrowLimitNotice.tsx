/**
 * BorrowLimitNotice
 *
 * Heads-up at the top of a borrow picker: this position can only borrow so
 * many assets, so the choice below is not freely reversible. Rendered only
 * while the spoke sets a cap — with none, there is nothing to warn about.
 *
 * Drawn from Figma 13839:7434 rather than core-ui's `Callout`, which fixes the
 * icon tile's fill from its variant and offers no way past it; the design uses
 * #d1792c, which no palette token carries. (`Callout` does take an `icon`, so
 * only the fill forced this.) Title and body sit flush per 13839:7438, where
 * the body starts at the title's height with no gap.
 */

import { PiWarningCircleFill } from "react-icons/pi";

import { SINGLE_BORROW_ASSET_DOCS_URL } from "@/constants";
import { COPY } from "@/copy";

/** Figma 13839:7436. No palette token carries this fill. */
const ICON_TILE_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#d1792c]";

/** Which picker is below: the asset list, or one asset's hubs. */
export type BorrowPickerMode = "asset" | "hub";

interface BorrowLimitNoticeProps {
  mode: BorrowPickerMode;
  limit: number;
}

export function BorrowLimitNotice({ mode, limit }: BorrowLimitNoticeProps) {
  const { assetNoticeTitle, assetNoticeBody, hubNoticeTitle, hubNoticeBody } =
    COPY.loans.borrowLimit;
  const title =
    mode === "hub" ? hubNoticeTitle(limit) : assetNoticeTitle(limit);
  const body = mode === "hub" ? hubNoticeBody(limit) : assetNoticeBody(limit);

  return (
    <div
      role="status"
      className="flex w-full items-start gap-4 rounded-lg border border-secondary-strokeLight bg-background-secondary p-4"
      data-testid="borrow-limit-notice"
    >
      <div aria-hidden="true" className={ICON_TILE_CLASS}>
        <PiWarningCircleFill size={24} className="text-accent-contrast" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="break-words text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
          {title}
        </p>
        <p className="break-words text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
          {body}
          {SINGLE_BORROW_ASSET_DOCS_URL && (
            <>
              {" "}
              <a
                href={SINGLE_BORROW_ASSET_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {COPY.loans.borrowLimit.learnMore}
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
