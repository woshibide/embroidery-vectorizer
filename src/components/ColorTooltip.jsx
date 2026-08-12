import { useAppStore } from "../store/useAppStore.js";
import { clamp } from "../lib/geometry.js";

// Stays mounted at all times (toggled via [hidden], like the legacy app's
// single persistent tooltip node) instead of mounting/unmounting per hover —
// gliding across many adjacent heatmap/share-bar cells fires pointerenter/
// pointerleave rapidly, and remounting a component on every one of those
// reads as a laggy "flying" tooltip instead of a smooth reposition.
export default function ColorTooltip() {
  const tooltip = useAppStore(state => state.colorTooltip);
  const margin = 42;
  const left = tooltip ? clamp(tooltip.clientX, margin, window.innerWidth - margin) : 0;
  const top = tooltip ? Math.max(26, tooltip.clientY) : 0;
  const copied = !!tooltip?.copied;
  return (
    <div
      // Keyed on copyToken so each copy remounts the node and replays the
      // flicker — it only changes on click, never while gliding between cells.
      key={tooltip?.copyToken ?? 0}
      className={`color-tooltip${copied ? " flicker-burst" : ""}`}
      role="tooltip"
      hidden={!tooltip}
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      <span className="color-tooltip-slot">
        <span aria-hidden={copied}>{tooltip?.hex}</span>
        <span className="color-tooltip-copied" hidden={!copied}>Copied</span>
      </span>
    </div>
  );
}
