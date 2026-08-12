import { useEffect, useRef, useState } from "react";
import { useAppStore, MAX_EDGE_EXPANSION } from "../store/useAppStore.js";
import { peekEdge, setEdge, setEdgeExpanded } from "../store/actions.js";
import { queuePosterize } from "../lib/posterize.js";
import { clamp } from "../lib/geometry.js";
import { slugify } from "../lib/color.js";

function drawEdgePreview(canvas, layerRgb, edge) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  const colorStart = 1 - edge.colorReach / 100;
  const whiteEnd = edge.whiteReach / 100;
  let currentError = new Float32Array(width);
  let nextError = new Float32Array(width);

  for (let y = 0; y < height; y++) {
    nextError.fill(0);
    for (let x = 0; x < width; x++) {
      const involvement = height === 1 ? .5 : 1 - y / (height - 1);
      const halftoneThreshold = .5 - (edge.halftoneExpansion / MAX_EDGE_EXPANSION) * .5;
      let colored = involvement >= halftoneThreshold;
      if (edge.mode === "dither") {
        if (colorStart > whiteEnd) {
          colored = involvement >= colorStart;
        } else if (involvement < colorStart) {
          colored = false;
        } else if (involvement > whiteEnd) {
          colored = true;
        } else {
          const value = clamp(involvement * 255 + currentError[x], 0, 255);
          colored = value >= 127.5;
          const error = value - (colored ? 255 : 0);
          if (x + 1 < width) currentError[x + 1] += error * 7 / 16;
          if (x > 0) nextError[x - 1] += error * 3 / 16;
          nextError[x] += error * 5 / 16;
          if (x + 1 < width) nextError[x + 1] += error * 1 / 16;
        }
      }
      const p = (y * width + x) * 4;
      if (colored) {
        image.data[p] = layerRgb[0];
        image.data[p + 1] = layerRgb[1];
        image.data[p + 2] = layerRgb[2];
        image.data[p + 3] = 255;
      }
    }
    [currentError, nextError] = [nextError, currentError];
  }
  context.clearRect(0, 0, width, height);
  context.putImageData(image, 0, 0);
}

// Per-color (or per-merged-group) dither/halftone edge-treatment widget.
// `target` = a layer object, or a group-edge-target object from
// getGroupEdgeTarget — both have {hex, rgb, edgeKey?, edgeLabel?, edgeSubject?, name}.
export default function EdgeTransitionPanel({ target, panelIndex, onChanged }) {
  const canvasRef = useRef(null);
  const expandedEdges = useAppStore(state => state.expandedEdges);
  const edgesVersion = useAppStore(state => state.edges);
  const edge = peekEdge(target);
  const edgeLabel = target.edgeLabel || "Edge";
  const edgeSubject = target.edgeSubject || target.name;
  const open = expandedEdges.has(edge.key);
  const panelId = `edge-${panelIndex}-${slugify(edge.key)}`;
  const radioName = `edge-method-${panelIndex}-${slugify(edge.key)}`;
  void edgesVersion;

  const redrawPreview = () => {
    if (canvasRef.current) drawEdgePreview(canvasRef.current, target.rgb, edge);
  };

  useEffect(() => {
    if (open) redrawPreview();
  }, [open, edge.mode, edge.colorReach, edge.whiteReach, edge.halftoneExpansion, target.hex]);

  const halftone = edge.mode === "halftone";
  const colorTop = halftone ? 50 + (edge.halftoneExpansion / MAX_EDGE_EXPANSION) * 50 : edge.colorReach;
  const whiteTop = halftone ? 50 : 100 - edge.whiteReach;
  const whiteEnabled = edge.mode === "dither";

  const setFromTop = (kind, topPercent) => {
    const clampedTop = clamp(topPercent, 0, 100);
    const patch = {};
    if (kind === "color" && edge.mode === "halftone") {
      patch.halftoneExpansion = Math.round(clamp((clampedTop - 50) / 50, 0, 1) * MAX_EDGE_EXPANSION);
    } else if (kind === "color") {
      patch.colorReach = Math.round(clampedTop);
    } else {
      patch.whiteReach = Math.round(100 - clampedTop);
    }
    setEdge(target, patch);
    queuePosterize();
    onChanged?.();
  };

  const makeHandleHandlers = kind => ({
    onPointerDown: event => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const rect = event.currentTarget.closest(".transition-preview").getBoundingClientRect();
      setFromTop(kind, ((event.clientY - rect.top) / rect.height) * 100);
    },
    onPointerMove: event => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const rect = event.currentTarget.closest(".transition-preview").getBoundingClientRect();
      setFromTop(kind, ((event.clientY - rect.top) / rect.height) * 100);
    },
    onKeyDown: event => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const currentTop = kind === "color"
        ? (edge.mode === "halftone" ? 50 + (edge.halftoneExpansion / MAX_EDGE_EXPANSION) * 50 : edge.colorReach)
        : 100 - edge.whiteReach;
      const step = event.shiftKey ? 10 : 1;
      const nextTop = event.key === "Home" ? 0 : event.key === "End" ? 100 : currentTop + (event.key === "ArrowUp" ? -step : step);
      setFromTop(kind, nextTop);
    }
  });

  return (
    <div className={`palette-transition${open ? " is-open" : ""}`}>
      <button
        className="transition-toggle"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${edgeLabel} settings for ${edgeSubject}: ${edge.mode}`}
        onClick={() => {
          setEdgeExpanded(edge.key, !open);
          if (!open) requestAnimationFrame(redrawPreview);
        }}
      >
        <span className="transition-title">{edgeLabel}: {edge.mode === "dither" ? "Dither" : "Halftone"}</span>
        <span className="transition-disclosure">{open ? "−" : "+"}</span>
      </button>
      <div className="transition-panel" id={panelId} hidden={!open}>
        <div className="transition-method" role="radiogroup" aria-label={`${edgeLabel} treatment for ${edgeSubject}`}>
          {[["halftone", "Halftone"], ["dither", "Dither"]].map(([value, labelText]) => (
            <label key={value}>
              <input
                type="radio"
                name={radioName}
                value={value}
                checked={edge.mode === value}
                onChange={() => {
                  setEdge(target, { mode: value });
                  queuePosterize();
                  onChanged?.();
                  requestAnimationFrame(redrawPreview);
                }}
              />
              <span>{labelText}</span>
            </label>
          ))}
        </div>
        <div className={`edge-preview-shell ${edge.mode === "dither" ? "is-dither" : "is-halftone"}`} style={{ "--edge-color": target.hex }}>
          <div className="edge-rail edge-rail-color" data-label="Color">
            <div
              className="edge-handle edge-handle-color"
              tabIndex={0}
              role="slider"
              aria-label={halftone ? `${edgeSubject} edge overlay` : `${edgeSubject} reach`}
              aria-valuemin={0}
              aria-valuemax={halftone ? MAX_EDGE_EXPANSION : 100}
              aria-valuenow={halftone ? edge.halftoneExpansion : edge.colorReach}
              aria-valuetext={halftone ? `Add ${edge.halftoneExpansion} pixels` : `${edge.colorReach}% color reach`}
              style={{ top: `${colorTop}%` }}
              {...makeHandleHandlers("color")}
            />
          </div>
          <div className="transition-preview edge-preview">
            <canvas ref={canvasRef} aria-label={`Macro preview of ${edgeSubject} fading into white space`} />
            <span className="edge-guide edge-guide-color" style={{ top: `${colorTop}%` }} />
            <span className="edge-guide edge-guide-white" style={{ top: `${whiteTop}%` }} />
            <span className="edge-overlay-label" style={{ top: `${50 + (colorTop - 50) / 2}%` }}>
              {edge.halftoneExpansion ? `+ ${edge.halftoneExpansion} px` : ""}
            </span>
          </div>
          <div className="edge-rail edge-rail-white" data-label="White">
            <span className="edge-zero-mark" />
            <div
              className="edge-handle edge-handle-white"
              tabIndex={whiteEnabled ? 0 : -1}
              role="slider"
              aria-disabled={!whiteEnabled}
              aria-label="White reach"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={edge.whiteReach}
              aria-valuetext={`${edge.whiteReach}% white reach`}
              style={{ top: `${whiteTop}%` }}
              {...makeHandleHandlers("white")}
            />
          </div>
        </div>
        <p className="transition-note">Drag the side handles vertically. The left line sets color reach; the right line sets white reach. Their overlap is Floyd–Steinberg dither.</p>
      </div>
    </div>
  );
}
