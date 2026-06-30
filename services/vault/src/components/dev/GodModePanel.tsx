/**
 * GodModePanel (dev / QA only — gated behind NEXT_PUBLIC_FF_GOD_MODE_PANEL).
 *
 * A draggable, floating "god mode" admin panel for exercising UI states during
 * development. It can also pop out into a separate browser window (rendered via
 * a React portal, so it stays in the same React tree and shares state with the
 * app — no cross-window plumbing).
 *
 * It is a controller only: it never renders the cards itself. It manages a list
 * of mock items (each a deposit / withdrawal / collateral at some state) that
 * render inside the REAL dashboard sections (see demoDeposit.ts).
 *
 * Chrome is intentionally theme-independent (fixed zinc colors) and inline, not
 * routed through copy.ts — none of it is shown to depositors.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  addDemoItem,
  type DemoCta,
  type DemoItem,
  type DemoType,
  itemSectionHint,
  removeDemoItem,
  scenariosForType,
  setDemoEnabled,
  setDemoHideReal,
  setDemoItemAmount,
  setDemoItemBatched,
  setDemoItemState,
  setDemoItemType,
  useDemoEnabled,
  useDemoHideReal,
  useDemoItems,
} from "./demoDeposit";

const TYPE_LABELS: Record<DemoType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  collateral: "Collateral",
};

const CTA_BADGE: Record<DemoCta, { label: string; className: string }> = {
  primary: { label: "Orange CTA", className: "bg-orange-500 text-white" },
  outlined: {
    label: "Outlined CTA",
    className: "border border-zinc-400 text-zinc-200",
  },
  none: { label: "No CTA", className: "bg-zinc-700 text-zinc-300" },
};

const CONTROL_BUTTON_CLASS =
  "rounded border border-zinc-600 px-2 py-1 text-xs disabled:opacity-40";

function ItemRow({ item, index }: { item: DemoItem; index: number }) {
  const scenarios = scenariosForType(item.type);
  const total = scenarios.length;
  const scenario = scenarios[item.stateIndex] ?? scenarios[0];
  const badge = CTA_BADGE[scenario.expectedCta];
  const position = index + 1;
  const clamp = (next: number) => Math.min(total - 1, Math.max(0, next));

  return (
    <div className="space-y-2 rounded-lg border border-zinc-700/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <select
          value={item.type}
          onChange={(e) =>
            setDemoItemType(item.key, e.target.value as DemoType)
          }
          className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
          aria-label={`Mock ${position} type`}
        >
          {(Object.keys(TYPE_LABELS) as DemoType[]).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-zinc-400">
            {item.stateIndex + 1}/{total}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <button
            type="button"
            onClick={() => removeDemoItem(item.key)}
            className={CONTROL_BUTTON_CLASS}
            aria-label={`Remove mock ${position}`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Step slider + dropdown both drive the state — slider for quick
          stepping, dropdown for jumping straight to a state. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDemoItemState(item.key, clamp(item.stateIndex - 1))}
          disabled={item.stateIndex === 0}
          className={CONTROL_BUTTON_CLASS}
        >
          Prev
        </button>
        <input
          type="range"
          min={0}
          max={total - 1}
          value={item.stateIndex}
          onChange={(e) => setDemoItemState(item.key, Number(e.target.value))}
          className="min-w-0 flex-1 accent-orange-500"
          aria-label={`Mock ${position} step`}
        />
        <button
          type="button"
          onClick={() => setDemoItemState(item.key, clamp(item.stateIndex + 1))}
          disabled={item.stateIndex === total - 1}
          className={CONTROL_BUTTON_CLASS}
        >
          Next
        </button>
      </div>

      <select
        value={item.stateIndex}
        onChange={(e) => setDemoItemState(item.key, Number(e.target.value))}
        className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
        aria-label={`Mock ${position} state`}
      >
        {scenarios.map((s, i) => (
          <option key={s.key} value={i}>
            {s.label}
          </option>
        ))}
      </select>

      <label className="flex items-center justify-between gap-2 text-xs">
        <span>Amount (BTC)</span>
        <input
          type="number"
          min="0"
          step="0.0001"
          value={item.amount}
          onChange={(e) => setDemoItemAmount(item.key, e.target.value)}
          className="w-28 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs"
          aria-label={`Mock ${position} amount (BTC)`}
        />
      </label>

      {item.type === "deposit" && (
        <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
          <span>Batched (group with other batched deposits)</span>
          <input
            type="checkbox"
            checked={item.batched}
            onChange={(e) => setDemoItemBatched(item.key, e.target.checked)}
          />
        </label>
      )}

      <div className="text-xs text-zinc-500">
        Renders in: {itemSectionHint(item)}
      </div>
    </div>
  );
}

function DemoControls() {
  const enabled = useDemoEnabled();
  const hideReal = useDemoHideReal();
  const items = useDemoItems();

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
        <span>Inject demo</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setDemoEnabled(e.target.checked)}
        />
      </label>

      <fieldset
        disabled={!enabled}
        className={`space-y-3 border-0 p-0 ${enabled ? "" : "opacity-40"}`}
      >
        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
          <span>Hide real items</span>
          <input
            type="checkbox"
            checked={hideReal}
            onChange={(e) => setDemoHideReal(e.target.checked)}
          />
        </label>

        {items.map((item, index) => (
          <ItemRow key={item.key} item={item} index={index} />
        ))}

        <button
          type="button"
          onClick={() => addDemoItem("deposit")}
          className="w-full rounded border border-dashed border-zinc-600 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          + Add mock
        </button>
      </fieldset>
    </div>
  );
}

function PanelBody() {
  return (
    <div className="space-y-2">
      <div className="tracking-wide text-xs font-semibold uppercase text-zinc-400">
        Mocks
      </div>
      <DemoControls />
    </div>
  );
}

export function GodModePanel() {
  // Defaults: collapsed (small launcher) anchored bottom-right. `pos` is null
  // until the user drags — then it switches to absolute top/left positioning.
  const [collapsed, setCollapsed] = useState(true);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [popupContainer, setPopupContainer] = useState<HTMLElement | null>(
    null,
  );
  const popupRef = useRef<Window | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Teardown for an in-progress drag's window listeners (see `startDrag`).
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const closePopup = useCallback(() => {
    const win = popupRef.current;
    popupRef.current = null;
    setPopupContainer(null);
    if (win) {
      win.removeEventListener("beforeunload", closePopup);
      win.close();
    }
  }, []);

  // Close the popup if the panel itself unmounts.
  useEffect(() => () => closePopup(), [closePopup]);

  // Tear down a still-active drag if the panel unmounts mid-drag (e.g.
  // navigation): `handleUp` would otherwise never fire to remove the window
  // listeners. Mirrors the popup cleanup above.
  useEffect(() => () => dragCleanupRef.current?.(), []);

  // Opened from the click (a user gesture) — NOT an effect — so React
  // StrictMode's double-invoke can't open-then-close it.
  const openPopup = () => {
    const win = window.open("", "god-mode-panel", "width=460,height=820");
    if (!win) return;
    win.document.title = "God mode";
    win.document.body.style.margin = "0";
    win.document.body.style.background = "#18181b";
    // Copy the app's styles so Tailwind classes resolve in the popup.
    document
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((node) => win.document.head.appendChild(node.cloneNode(true)));
    const mount = win.document.createElement("div");
    win.document.body.appendChild(mount);
    popupRef.current = win;
    win.addEventListener("beforeunload", closePopup);
    setPopupContainer(mount);
  };

  // Drag via window-level listeners — robust, no pointer-capture quirks. The
  // origin is captured at press time, so the panel follows the cursor 1:1.
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    // The whole header is the drag zone, but its buttons keep their own click.
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    // First drag from the default (bottom-right) anchor: seed top/left from the
    // panel's current on-screen rect so it doesn't jump.
    const rect = panelRef.current?.getBoundingClientRect();
    const originLeft = pos?.left ?? rect?.left ?? 0;
    const originTop = pos?.top ?? rect?.top ?? 0;
    const handleMove = (ev: PointerEvent) => {
      setPos({
        left: Math.max(0, originLeft + ev.clientX - startX),
        top: Math.max(0, originTop + ev.clientY - startY),
      });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      dragCleanupRef.current = null;
    };
    // `handleUp` already removes both listeners, so it doubles as the unmount
    // teardown the effect above invokes.
    dragCleanupRef.current = handleUp;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const popup =
    popupContainer &&
    createPortal(
      <div className="min-h-screen bg-zinc-900 p-4 text-zinc-100">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">God mode — admin panel</span>
          <button
            type="button"
            onClick={closePopup}
            className={CONTROL_BUTTON_CLASS}
          >
            Return ↙
          </button>
        </div>
        <PanelBody />
      </div>,
      popupContainer,
    );

  function renderFloating() {
    if (collapsed) {
      return (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="fixed bottom-4 right-4 z-[9999] rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-lg"
        >
          God mode
        </button>
      );
    }

    return (
      // `resize: both` + `overflow: hidden` makes the box user-resizable from
      // the bottom-right corner. The header stays fixed; only the body scrolls,
      // so content never overflows the box. Anchored bottom-right by default;
      // switches to absolute top/left once dragged.
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          ...(pos
            ? { top: pos.top, left: pos.left }
            : { bottom: 16, right: 16 }),
          resize: "both",
          overflow: "hidden",
          minWidth: 320,
          minHeight: 200,
        }}
        className="z-[9999] flex max-h-[85vh] w-[420px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl"
      >
        <div
          onPointerDown={startDrag}
          className="flex shrink-0 cursor-move select-none items-center justify-between gap-2 border-b border-zinc-800 p-3"
        >
          <div className="flex-1 text-sm font-semibold">God mode</div>
          <button
            type="button"
            onClick={openPopup}
            className={CONTROL_BUTTON_CLASS}
          >
            Pop out ↗
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className={CONTROL_BUTTON_CLASS}
          >
            Hide
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          <PanelBody />
        </div>
      </div>
    );
  }

  // When popped out, god mode lives entirely in its own window — nothing is
  // rendered over the page. Closing that window (its "Return ↙" button or the
  // OS close) fires `beforeunload` → closePopup, restoring the floating panel.
  return (
    <>
      {popup}
      {!popupContainer && renderFloating()}
    </>
  );
}
