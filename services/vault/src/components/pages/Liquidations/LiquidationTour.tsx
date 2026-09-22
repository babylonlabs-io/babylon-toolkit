import { Button, SidebarBrandLockup } from "@babylonlabs-io/core-ui";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { COPY } from "@/copy";

const STORAGE_KEY = "tbv-liquidation-tour-seen";
const TARGETS = [
  "liquidation-tour-position",
  "liquidation-tour-health",
  "liquidation-tour-simulation",
  "liquidation-tour-events",
  "liquidation-tour-outcomes",
] as const;
const PADDING = 8;
const GAP = 24;
const TOP = 88;

function hasSeenTour() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Storage can be disabled. The current visit can still end the tour.
  }
}

interface Placement {
  step: number;
  target: DOMRect;
  left: number;
  top: number;
  above: boolean;
  overlapsTarget: boolean;
  arrow: number;
}

export function LiquidationTour({ ready }: { ready: boolean }) {
  const [step, setStep] = useState<number | null>(() =>
    hasSeenTour() ? null : -1,
  );
  const [placement, setPlacement] = useState<Placement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const copy = COPY.liquidations.tour;
  const open = ready && step !== null;
  const welcome = step === -1;
  const current = step !== null && step >= 0 ? copy.steps[step] : null;

  const close = useCallback(() => {
    markSeen();
    setStep(null);
  }, []);

  useLayoutEffect(() => {
    if (!open || !overlayRef.current) return;
    const overlay = overlayRef.current;
    const previousFocus = document.activeElement;
    const siblings = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== overlay,
    );
    const previousInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => {
      element.inert = true;
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !buttons.includes(document.activeElement as HTMLButtonElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      siblings.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open) return;
    if (step === null || step < 0) return;
    const target = document.getElementById(TARGETS[step]);
    const card = cardRef.current;
    if (!target || !card) {
      close();
      return;
    }

    // Leave room for the card before drawing the target and its cutout.
    const cardHeight = card.getBoundingClientRect().height;
    const rect = target.getBoundingClientRect();
    const desiredTop = step >= 2 ? TOP + cardHeight + GAP : TOP + PADDING;
    if (
      step >= 2 ||
      rect.top < TOP ||
      rect.bottom + cardHeight + GAP > innerHeight
    ) {
      window.scrollBy({ top: rect.top - desiredTop, behavior: "instant" });
    }

    const measure = () => {
      if (!target.isConnected) {
        close();
        return;
      }
      const targetRect = target.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      const above =
        targetRect.top - GAP - cardRect.height >= TOP &&
        (step >= 2 || targetRect.bottom + GAP + cardRect.height > height - 16);
      const left = Math.max(
        16,
        Math.min(
          targetRect.left + targetRect.width / 2 - cardRect.width / 2,
          width - cardRect.width - 16,
        ),
      );
      const top = Math.max(
        TOP,
        Math.min(
          above
            ? targetRect.top - GAP - cardRect.height
            : targetRect.bottom + GAP,
          height - cardRect.height - 16,
        ),
      );
      setPlacement({
        step,
        target: targetRect,
        left,
        top,
        above,
        overlapsTarget:
          top < targetRect.bottom + PADDING &&
          top + cardRect.height > targetRect.top - PADDING,
        arrow: Math.max(
          24,
          Math.min(
            targetRect.left + targetRect.width / 2 - left,
            cardRect.width - 24,
          ),
        ),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    observer.observe(card);
    observer.observe(document.body);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, step, close]);

  useLayoutEffect(() => {
    if (open) titleRef.current?.focus({ preventScroll: true });
  }, [open, step, placement?.step]);

  if (!open) return null;
  const positioned = placement?.step === step ? placement : null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid="liquidation-tour-overlay"
      className="fixed inset-0 z-[100000] [&_*]:!animate-none [&_*]:!transition-none"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        onClick={welcome ? close : undefined}
      >
        <defs>
          <mask id={`${id}-mask`}>
            <rect width="100%" height="100%" fill="white" />
            {positioned && !welcome && (
              <rect
                data-testid="liquidation-tour-spotlight"
                x={positioned.target.left - PADDING}
                y={positioned.target.top - PADDING}
                width={positioned.target.width + PADDING * 2}
                height={positioned.target.height + PADDING * 2}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="black"
          fillOpacity={welcome ? 0.5 : 0.7}
          mask={`url(#${id}-mask)`}
        />
      </svg>

      {welcome ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-y-auto p-4">
          <div className="pointer-events-auto flex max-h-full w-[540px] max-w-full flex-col overflow-y-auto rounded-2xl border border-secondary-strokeLight bg-background-contrast p-6">
            <button
              type="button"
              aria-label={copy.close}
              onClick={close}
              className="self-end rounded focus-visible:outline focus-visible:outline-2"
            >
              <img
                src="/images/liquidation-tour/close.svg"
                alt=""
                className="size-6 dark:brightness-150"
              />
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
                  onClick={close}
                >
                  {copy.notNow}
                </Button>
                <Button
                  color="secondary"
                  size="medium"
                  className="h-10 flex-1"
                  onClick={() => {
                    markSeen();
                    setStep(0);
                  }}
                >
                  {copy.start}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        current && (
          <>
            <div className="absolute inset-x-0 top-0 flex h-[72px] items-center justify-between gap-3 px-4 sm:px-6">
              <div
                aria-hidden="true"
                className="hidden w-[200px] items-center gap-3 text-white sm:flex"
              >
                <SidebarBrandLockup />
              </div>
              <span className="rounded-full bg-background-secondary px-5 py-[11px] text-base text-accent-primary">
                {copy.stepLabel(step! + 1, copy.steps.length)}
              </span>
              <div className="flex justify-end sm:w-[200px]">
                <Button
                  size="medium"
                  className="h-10 w-[120px] !bg-background-secondary !text-accent-primary"
                  onClick={close}
                >
                  {copy.exit}
                </Button>
              </div>
            </div>
            <div
              ref={cardRef}
              data-testid="liquidation-tour-card"
              className="absolute w-[360px] max-w-[calc(100%-32px)] rounded-lg bg-[#f9f9f9] text-black shadow-lg"
              style={{
                left: positioned?.left ?? 16,
                top: positioned?.top ?? TOP,
                visibility: positioned ? "visible" : "hidden",
              }}
            >
              <img
                src="/images/liquidation-tour/arrow.svg"
                alt=""
                hidden={positioned?.overlapsTarget}
                className="absolute h-[18px] w-[21px]"
                style={{
                  left: (positioned?.arrow ?? 24) - 10.5,
                  top: positioned?.above ? "100%" : -18,
                  transform: positioned?.above ? "rotate(180deg)" : undefined,
                }}
              />
              <div
                key={step}
                className="max-h-[calc(100dvh-104px)] overflow-y-auto p-6"
              >
                <h2
                  ref={titleRef}
                  id={`${id}-title`}
                  tabIndex={-1}
                  className="text-xl font-normal leading-[1.6] tracking-[0.15px] outline-none"
                >
                  <span aria-hidden="true">{step! + 1}. </span>
                  {current.title}
                </h2>
                <p
                  id={`${id}-body`}
                  className="text-sm leading-[1.43] tracking-[0.17px]"
                >
                  {current.body}
                </p>
                <div className="mt-6 flex gap-4">
                  <Button
                    variant="outlined"
                    size="medium"
                    className="flex-1 !border-[#ddd] !text-black"
                    onClick={close}
                  >
                    {copy.exit}
                  </Button>
                  <Button
                    color="secondary"
                    size="medium"
                    className="flex-1"
                    onClick={() =>
                      step === copy.steps.length - 1
                        ? close()
                        : setStep(step! + 1)
                    }
                  >
                    {copy.next}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )
      )}
    </div>,
    document.body,
  );
}
