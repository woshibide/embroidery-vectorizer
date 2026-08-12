import { useAppStore } from "../store/useAppStore.js";
import { clamp } from "../lib/geometry.js";

export default function ColorTooltip() {
  const tooltip = useAppStore(state => state.colorTooltip);
  if (!tooltip) return null;
  const margin = 42;
  const left = clamp(tooltip.clientX, margin, window.innerWidth - margin);
  const top = Math.max(26, tooltip.clientY);
  return (
    <div className="color-tooltip" role="tooltip" style={{ left: `${left}px`, top: `${top}px` }}>
      {tooltip.hex}
    </div>
  );
}
