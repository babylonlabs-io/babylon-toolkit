import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  loadLiquidationTourSeen,
  markLiquidationTourSeen,
} from "@/storage/liquidationTourStorage";

import {
  layoutTourCard,
  tourScrollOffset,
  type TourCardLayout,
} from "./liquidationTourPlacement";
import {
  LIQUIDATION_TOUR_STEPS,
  type LiquidationTourStep,
} from "./liquidationTourSteps";

type LiquidationTourState =
  | { kind: "hidden" }
  | { kind: "welcome" }
  | { kind: "step"; index: number };

/** What the tour shows now. A page that is not ready shows nothing. */
type LiquidationTourView =
  | { kind: "hidden" }
  | { kind: "welcome" }
  | {
      kind: "step";
      index: number;
      step: LiquidationTourStep;
      /** Null until the card is measured for this step. */
      layout: TourCardLayout | null;
    };

/** The card's layout, with the step it was measured for. */
interface MeasuredLayout {
  index: number;
  layout: TourCardLayout;
}

const HIDDEN = { kind: "hidden" } as const satisfies LiquidationTourState;

function toView(
  state: LiquidationTourState,
  open: boolean,
  measured: MeasuredLayout | null,
): LiquidationTourView {
  if (!open) return HIDDEN;
  if (state.kind !== "step") return state;
  return {
    ...state,
    step: LIQUIDATION_TOUR_STEPS[state.index],
    layout: measured?.index === state.index ? measured.layout : null,
  };
}

/**
 * The first-visit Liquidation Analysis tour: the welcome, then one step per
 * entry in `LIQUIDATION_TOUR_STEPS`. Every way out marks the tour seen, so it
 * never comes back. While it shows, the rest of the page is inert, Tab stays
 * in the tour and Escape ends it.
 */
export function useLiquidationTour(ready: boolean) {
  const [state, setState] = useState<LiquidationTourState>(() =>
    loadLiquidationTourSeen() ? HIDDEN : { kind: "welcome" },
  );
  const [measured, setMeasured] = useState<MeasuredLayout | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const open = ready && state.kind !== "hidden";

  const dismiss = useCallback(() => {
    markLiquidationTourSeen();
    setState(HIDDEN);
  }, []);

  const start = useCallback(() => {
    markLiquidationTourSeen();
    setState({ kind: "step", index: 0 });
  }, []);

  const next = useCallback(() => {
    setState((current) => {
      if (current.kind !== "step") return current;
      const index = current.index + 1;
      return index < LIQUIDATION_TOUR_STEPS.length
        ? { kind: "step", index }
        : HIDDEN;
    });
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
        dismiss();
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const focusInTour = buttons.some(
        (button) => button === document.activeElement,
      );
      if (
        event.shiftKey &&
        (document.activeElement === first || !focusInTour)
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
  }, [open, dismiss]);

  useLayoutEffect(() => {
    if (!open || state.kind !== "step") return;
    const { index } = state;
    const { targetId, placement } = LIQUIDATION_TOUR_STEPS[index];
    const target = document.getElementById(targetId);
    const card = cardRef.current;
    if (!target || !card) {
      dismiss();
      return;
    }

    // Leave room for the card before drawing the target and its cutout.
    window.scrollBy({
      top: tourScrollOffset({
        target: target.getBoundingClientRect(),
        cardHeight: card.getBoundingClientRect().height,
        viewportHeight: window.innerHeight,
        placement,
      }),
      behavior: "instant",
    });

    const measure = () => {
      if (!target.isConnected) {
        dismiss();
        return;
      }
      setMeasured({
        index,
        layout: layoutTourCard({
          target: target.getBoundingClientRect(),
          card: card.getBoundingClientRect(),
          viewport: {
            width: document.documentElement.clientWidth,
            height: window.innerHeight,
          },
          placement,
        }),
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
  }, [open, state, dismiss]);

  const view = toView(state, open, measured);
  const positioned = view.kind === "step" && view.layout !== null;

  useLayoutEffect(() => {
    if (open) titleRef.current?.focus({ preventScroll: true });
  }, [open, state, positioned]);

  return { view, overlayRef, cardRef, titleRef, dismiss, start, next };
}
