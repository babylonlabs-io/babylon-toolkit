import { Button, CloseIcon, SidebarBrandLockup } from "@babylonlabs-io/core-ui";
import { useId } from "react";
import { createPortal } from "react-dom";
import { twJoin } from "tailwind-merge";

import { COPY } from "@/copy";

import {
  ARROW_INSET,
  CARD_MIN_TOP,
  TOUR_BAR_HEIGHT,
  VIEWPORT_MARGIN,
} from "./liquidationTourPlacement";
import { LIQUIDATION_TOUR_STEPS } from "./liquidationTourSteps";
import { useLiquidationTour } from "./useLiquidationTour";

// Above core-ui's Hint tooltips (z-index 99999) and every dialog, so nothing
// on the page draws over the tour.
const TOUR_Z_CLASS = "z-[100000]";
// The brand and Exit columns share one width so the step label stays centered.
const TOP_BAR_SIDE_COLUMN_CLASS = "sm:w-[200px]";
const DIM_OPACITY = 0.6;
const WELCOME_WIDTH = 540;
const CARD_WIDTH = 360;
const CARD_MAX_WIDTH = `calc(100% - ${VIEWPORT_MARGIN * 2}px)`;
// The card body scrolls so the card never runs under the top bar or off the
// bottom of the viewport.
const CARD_MAX_HEIGHT = `calc(100dvh - ${CARD_MIN_TOP + VIEWPORT_MARGIN}px)`;
const ARROW_WIDTH = 21;
const ARROW_HEIGHT = 18;
// Figma's close mark is a 14px glyph in a 24px frame, as in NotificationCard.
const CLOSE_ICON_SIZE = 14;

export function LiquidationTour({ ready }: { ready: boolean }) {
  const { view, overlayRef, cardRef, titleRef, dismiss, start, next } =
    useLiquidationTour(ready);
  const id = useId();
  const copy = COPY.liquidations.tour;

  if (view.kind === "hidden") return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid="liquidation-tour-overlay"
      className={twJoin("fixed inset-0", TOUR_Z_CLASS)}
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id={`${id}-mask`}>
            <rect width="100%" height="100%" fill="white" />
            {view.kind === "step" && view.layout && (
              <rect
                data-testid="liquidation-tour-spotlight"
                {...view.layout.spotlight}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="black"
          fillOpacity={DIM_OPACITY}
          mask={`url(#${id}-mask)`}
        />
      </svg>

      {view.kind === "welcome" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-y-auto p-4">
          <div
            className="pointer-events-auto flex max-h-full max-w-full flex-col overflow-y-auto rounded-2xl border border-secondary-strokeLight bg-background-contrast p-6"
            style={{ width: WELCOME_WIDTH }}
          >
            <button
              type="button"
              aria-label={copy.close}
              onClick={dismiss}
              className="flex size-6 items-center justify-center self-end rounded focus-visible:outline focus-visible:outline-2"
            >
              <CloseIcon size={CLOSE_ICON_SIZE} variant="secondary" />
            </button>
            <div className="flex flex-col items-center gap-10">
              <img
                src="/images/liquidation-tour/welcome.svg"
                alt=""
                className="h-[131px] w-[151px] invert dark:invert-0"
              />
              <div className="flex flex-col gap-4 text-center">
                <h2
                  ref={titleRef}
                  id={`${id}-title`}
                  tabIndex={-1}
                  className="text-balance text-[34px] font-normal leading-[1.235] tracking-[0.25px] text-accent-primary outline-none"
                >
                  {copy.welcomeTitle}
                </h2>
                <p
                  id={`${id}-body`}
                  className="text-xl leading-[1.6] tracking-[0.15px] text-accent-secondary"
                >
                  {copy.welcomeBody}
                </p>
              </div>
              <div className="flex w-full gap-4">
                <Button
                  variant="outlined"
                  size="medium"
                  className="h-10 flex-1"
                  onClick={dismiss}
                >
                  {copy.notNow}
                </Button>
                <Button
                  color="secondary"
                  size="medium"
                  className="h-10 flex-1"
                  onClick={start}
                >
                  {copy.start}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 sm:px-6"
            style={{ height: TOUR_BAR_HEIGHT }}
          >
            <div
              aria-hidden="true"
              className={twJoin(
                "hidden items-center gap-3 text-black dark:text-white sm:flex",
                TOP_BAR_SIDE_COLUMN_CLASS,
              )}
            >
              <SidebarBrandLockup />
            </div>
            <span className="rounded-full bg-background-secondary px-5 py-[11px] text-base text-accent-primary">
              {copy.stepLabel(view.index + 1, LIQUIDATION_TOUR_STEPS.length)}
            </span>
            <div
              className={twJoin("flex justify-end", TOP_BAR_SIDE_COLUMN_CLASS)}
            >
              <Button
                size="medium"
                className="h-10 w-[120px] !bg-background-secondary !text-accent-primary"
                onClick={dismiss}
              >
                {copy.exit}
              </Button>
            </div>
          </div>
          <div
            ref={cardRef}
            data-testid="liquidation-tour-card"
            className="absolute rounded-lg bg-[#202020] text-white shadow-lg dark:bg-[#f9f9f9] dark:text-black"
            style={{
              width: CARD_WIDTH,
              maxWidth: CARD_MAX_WIDTH,
              left: view.layout?.left ?? VIEWPORT_MARGIN,
              top: view.layout?.top ?? CARD_MIN_TOP,
              visibility: view.layout ? "visible" : "hidden",
            }}
          >
            <div
              data-testid="liquidation-tour-arrow"
              aria-hidden="true"
              hidden={view.layout?.overlapsTarget}
              className="absolute bg-inherit"
              style={{
                width: ARROW_WIDTH,
                height: ARROW_HEIGHT,
                maskImage: "url(/images/liquidation-tour/arrow.svg)",
                maskRepeat: "no-repeat",
                left:
                  (view.layout?.arrowCenter ?? ARROW_INSET) - ARROW_WIDTH / 2,
                top: view.layout?.above ? "100%" : -ARROW_HEIGHT,
                transform: view.layout?.above ? "rotate(180deg)" : undefined,
              }}
            />
            <div
              key={view.step.key}
              className="overflow-y-auto p-6"
              style={{ maxHeight: CARD_MAX_HEIGHT }}
            >
              <h2
                ref={titleRef}
                id={`${id}-title`}
                tabIndex={-1}
                className="text-xl font-normal leading-[1.6] tracking-[0.15px] outline-none"
              >
                <span aria-hidden="true">{view.index + 1}. </span>
                {view.step.copy.title}
              </h2>
              <p
                id={`${id}-body`}
                className="text-sm leading-[1.43] tracking-[0.17px]"
              >
                {view.step.copy.body}
              </p>
              <div className="mt-6 flex gap-4">
                <Button
                  variant="outlined"
                  size="medium"
                  className="flex-1 !border-[#2f2f2f] !text-white dark:!border-[#ddd] dark:!text-black"
                  onClick={dismiss}
                >
                  {copy.exit}
                </Button>
                <Button
                  color="secondary"
                  size="medium"
                  className="flex-1"
                  onClick={next}
                >
                  {copy.next}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
