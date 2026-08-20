import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore.js";
import { queuePosterize } from "../lib/posterize.js";
import { curveValueAt, toneGraphPoint, normalizedTonePoint } from "../lib/tone.js";
import { clamp } from "../lib/geometry.js";

function cloneTonePoints(points) {
  return points.map(point => ({
    ...point,
    handleIn: point.handleIn ? { ...point.handleIn } : null,
    handleOut: point.handleOut ? { ...point.handleOut } : null
  }));
}

function normalizeToneHandles(points) {
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const previous = points[index - 1];
    const next = points[index + 1];
    if (point.handleIn) {
      point.handleIn.x = clamp(point.handleIn.x, previous?.x ?? point.x, point.x);
      point.handleIn.y = clamp(point.handleIn.y, 0, 1);
    }
    if (point.handleOut) {
      point.handleOut.x = clamp(point.handleOut.x, point.x, next?.x ?? point.x);
      point.handleOut.y = clamp(point.handleOut.y, 0, 1);
    }
  }
}

function addTonePoint(points, x, y = curveValueAt(x, points)) {
  const normalizedX = clamp(x, .01, .99);
  const existing = points.findIndex(point => Math.abs(point.x - normalizedX) < .015);
  if (existing >= 0) return existing;
  let index = points.findIndex(point => point.x > normalizedX);
  if (index < 0) index = points.length - 1;
  const previous = points[index - 1];
  const next = points[index];
  const span = Math.min(normalizedX - previous.x, next.x - normalizedX) / 2;
  const slope = (next.y - previous.y) / Math.max(.001, next.x - previous.x);
  const normalizedY = clamp(y, 0, 1);
  points.splice(index, 0, {
    x: normalizedX,
    y: normalizedY,
    handleIn: { x: normalizedX - span, y: clamp(normalizedY - slope * span, 0, 1) },
    handleOut: { x: normalizedX + span, y: clamp(normalizedY + slope * span, 0, 1) }
  });
  normalizeToneHandles(points);
  return index;
}

function moveToneTarget(points, target, normalized) {
  const point = points[target.index];
  if (!point) return;
  if (target.type === "point") {
    const previous = points[target.index - 1];
    const next = points[target.index + 1];
    const nextX = target.index === 0
      ? 0
      : target.index === points.length - 1
        ? 1
        : clamp(normalized.x, previous.x + .01, next.x - .01);
    const nextY = clamp(normalized.y, 0, 1);
    const deltaX = nextX - point.x;
    const deltaY = nextY - point.y;
    point.x = nextX;
    point.y = nextY;
    if (point.handleIn) { point.handleIn.x += deltaX; point.handleIn.y += deltaY; }
    if (point.handleOut) { point.handleOut.x += deltaX; point.handleOut.y += deltaY; }
  } else if (target.type === "handleIn" && point.handleIn) {
    point.handleIn.x = normalized.x;
    point.handleIn.y = normalized.y;
  } else if (target.type === "handleOut" && point.handleOut) {
    point.handleOut.x = normalized.x;
    point.handleOut.y = normalized.y;
  }
  normalizeToneHandles(points);
}

function drawToneCurve(canvas, points, selection, histogram, toneBlack, toneWhite) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  context.clearRect(0, 0, width, height);

  const peak = Math.max(1, ...histogram);
  context.fillStyle = "rgba(243, 38, 18, .22)";
  context.beginPath();
  context.moveTo(0, height);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * width;
    const y = height - Math.sqrt(histogram[i] / peak) * (height - 8);
    context.lineTo(x, y);
  }
  context.lineTo(width, height);
  context.closePath();
  context.fill();

  const blackX = toneGraphPoint({ x: toneBlack / 255, y: 0 }, width, height).x;
  const whiteX = toneGraphPoint({ x: toneWhite / 255, y: 0 }, width, height).x;
  context.fillStyle = "rgba(243, 38, 18, .08)";
  context.fillRect(0, 0, blackX, height);
  context.fillRect(whiteX, 0, width - whiteX, height);

  context.strokeStyle = "#f32612";
  context.lineWidth = 2;
  context.beginPath();
  canvas.setAttribute("aria-label", `Editable Bézier tone curve with ${points.length} anchor points. Click to add, use arrow keys to move the selected point, and Delete to remove it.`);
  const first = toneGraphPoint(points[0], width, height);
  context.moveTo(first.x, first.y);
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const out = toneGraphPoint(start.handleOut || start, width, height);
    const incoming = toneGraphPoint(end.handleIn || end, width, height);
    const endPoint = toneGraphPoint(end, width, height);
    context.bezierCurveTo(out.x, out.y, incoming.x, incoming.y, endPoint.x, endPoint.y);
  }
  context.stroke();

  if (selection?.type === "point") {
    const selected = points[selection.index];
    const anchor = toneGraphPoint(selected, width, height);
    for (const handle of [selected.handleIn, selected.handleOut].filter(Boolean)) {
      const handlePoint = toneGraphPoint(handle, width, height);
      context.strokeStyle = "rgba(243, 38, 18, .55)";
      context.beginPath();
      context.moveTo(anchor.x, anchor.y);
      context.lineTo(handlePoint.x, handlePoint.y);
      context.stroke();
      context.fillStyle = "#fff";
      context.strokeStyle = "#f32612";
      context.beginPath();
      context.rect(handlePoint.x - 3.5, handlePoint.y - 3.5, 7, 7);
      context.fill();
      context.stroke();
    }
  }

  for (let index = 0; index < points.length; index++) {
    const point = toneGraphPoint(points[index], width, height);
    const selected = selection?.type === "point" && selection.index === index;
    context.fillStyle = selected ? "#f32612" : "#fff";
    context.strokeStyle = "#f32612";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, selected ? 5.5 : 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
}

// Self-contained widget: owns its own working copy of tonePoints/selection
// via refs (mirroring the legacy app's single mutable `state` object), only
// committing to the Zustand store (and re-queuing posterize) at the same
// discrete moments the legacy app did — point add/remove/reset/nudge, and
// pointer-up at the end of a drag. Continuous drag frames redraw the canvas
// directly, never touching React state, so dragging never re-renders.
export default function ToneCurve() {
  const canvasRef = useRef(null);
  const pointsRef = useRef(cloneTonePoints(useAppStore.getState().tonePoints));
  const dragRef = useRef(null);
  const [selection, setSelection] = useState({ type: "point", index: 0 });
  const histogram = useAppStore(state => state.histogram);
  const toneBlack = useAppStore(state => state.toneBlack);
  const toneWhite = useAppStore(state => state.toneWhite);

  const redraw = () => drawToneCurve(canvasRef.current, pointsRef.current, selection, histogram, toneBlack, toneWhite);

  useEffect(redraw, [histogram, toneBlack, toneWhite, selection]);
  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const commit = () => {
    useAppStore.getState().setTonePoints(cloneTonePoints(pointsRef.current));
    queuePosterize();
  };

  const pointerPosition = event => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
  };

  const hitTarget = event => {
    const pointer = pointerPosition(event);
    const points = pointsRef.current;
    if (selection?.type === "point") {
      const point = points[selection.index];
      for (const type of ["handleIn", "handleOut"]) {
        if (!point[type]) continue;
        const handle = toneGraphPoint(point[type], pointer.width, pointer.height);
        if (Math.hypot(pointer.x - handle.x, pointer.y - handle.y) <= 9) return { type, index: selection.index };
      }
    }
    for (let index = points.length - 1; index >= 0; index--) {
      const point = toneGraphPoint(points[index], pointer.width, pointer.height);
      if (Math.hypot(pointer.x - point.x, pointer.y - point.y) <= 10) return { type: "point", index };
    }
    return null;
  };

  const canRemoveSelected = selection && selection.type === "point" && selection.index > 0 && selection.index < pointsRef.current.length - 1;

  return (
    <div className="control">
      <div className="control-head">
        <span className="control-label">Tone distribution</span>
        <output className="control-value">{toneBlack} — {toneWhite}</output>
      </div>
      <div className="tone-panel">
        <div className="tone-plot">
          <canvas
            ref={canvasRef}
            id="tone-curve"
            tabIndex={0}
            aria-label="Editable Bézier tone curve over the source luminance histogram"
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault();
              const pointer = pointerPosition(event);
              let target = hitTarget(event);
              if (!target) {
                const normalized = normalizedTonePoint(pointer.x, pointer.y, pointer.width, pointer.height);
                const index = addTonePoint(pointsRef.current, normalized.x, normalized.y);
                target = { type: "point", index };
              }
              setSelection({ type: "point", index: target.index });
              dragRef.current = target;
              event.currentTarget.style.cursor = "grabbing";
              event.currentTarget.setPointerCapture(event.pointerId);
              redraw();
            }}
            onPointerMove={event => {
              if (!dragRef.current) {
                event.currentTarget.style.cursor = hitTarget(event) ? "grab" : "crosshair";
                return;
              }
              event.preventDefault();
              const pointer = pointerPosition(event);
              const normalized = normalizedTonePoint(pointer.x, pointer.y, pointer.width, pointer.height);
              moveToneTarget(pointsRef.current, dragRef.current, normalized);
              redraw();
            }}
            onPointerUp={event => {
              if (!dragRef.current) return;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              dragRef.current = null;
              event.currentTarget.style.cursor = "crosshair";
              commit();
            }}
            onPointerCancel={() => { dragRef.current = null; }}
            onKeyDown={event => {
              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                if (!canRemoveSelected) return;
                pointsRef.current.splice(selection.index, 1);
                normalizeToneHandles(pointsRef.current);
                setSelection({ type: "point", index: Math.max(0, selection.index - 1) });
                commit();
                return;
              }
              if (event.key === "+" || event.key === "=") {
                event.preventDefault();
                let start = pointsRef.current[0];
                let widest = -1;
                for (let index = 0; index < pointsRef.current.length - 1; index++) {
                  const candidate = pointsRef.current[index];
                  const gap = pointsRef.current[index + 1].x - candidate.x;
                  if (gap > widest) { widest = gap; start = candidate; }
                }
                const x = start.x + widest / 2;
                const index = addTonePoint(pointsRef.current, x, curveValueAt(x, pointsRef.current));
                setSelection({ type: "point", index });
                commit();
                return;
              }
              const step = event.shiftKey ? .025 : .005;
              const movement = {
                ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]
              }[event.key];
              if (movement && selection?.type === "point") {
                event.preventDefault();
                const point = pointsRef.current[selection.index];
                moveToneTarget(pointsRef.current, selection, { x: point.x + movement[0], y: point.y + movement[1] });
                redraw();
                commit();
              }
            }}
          />
        </div>
        <div className="tone-toolbar">
          <button
            className="tone-tool"
            type="button"
            onClick={() => {
              let start = pointsRef.current[0];
              let widest = -1;
              for (let index = 0; index < pointsRef.current.length - 1; index++) {
                const candidate = pointsRef.current[index];
                const gap = pointsRef.current[index + 1].x - candidate.x;
                if (gap > widest) { widest = gap; start = candidate; }
              }
              const x = start.x + widest / 2;
              const index = addTonePoint(pointsRef.current, x, curveValueAt(x, pointsRef.current));
              setSelection({ type: "point", index });
              commit();
            }}
          >＋ Point</button>
          <button
            className="tone-tool"
            type="button"
            disabled={!canRemoveSelected}
            onClick={() => {
              if (!canRemoveSelected) return;
              pointsRef.current.splice(selection.index, 1);
              normalizeToneHandles(pointsRef.current);
              setSelection({ type: "point", index: Math.max(0, selection.index - 1) });
              commit();
            }}
          >− Point</button>
          <button
            className="tone-tool"
            type="button"
            onClick={() => {
              pointsRef.current = cloneTonePoints([
                { x: 0, y: 0, handleIn: null, handleOut: { x: 1 / 3, y: 1 / 3 } },
                { x: 1, y: 1, handleIn: { x: 2 / 3, y: 2 / 3 }, handleOut: null }
              ]);
              setSelection({ type: "point", index: 0 });
              commit();
            }}
          >Reset</button>
          <span className="tone-toolbar-note">Drag points + handles</span>
        </div>
        <div className="tone-sliders">
          <label className="tone-slider">
            <span className="tone-slider-head"><span>Blacks cut off</span><output>{toneBlack}</output></span>
            <input
              type="range"
              min="0"
              max="254"
              value={toneBlack}
              aria-label="Darkest luminance included in color analysis"
              style={{ "--fill": `${(toneBlack / 254) * 100}%` }}
              onChange={event => {
                const nextBlack = Math.min(Number(event.target.value), toneWhite - 1);
                useAppStore.getState().setToneRange(nextBlack, toneWhite);
                useAppStore.getState().recomputeHistogram();
                queuePosterize();
              }}
            />
          </label>
          <label className="tone-slider">
            <span className="tone-slider-head"><span>Whites cut off</span><output>{toneWhite}</output></span>
            <input
              type="range"
              min="1"
              max="255"
              value={toneWhite}
              aria-label="Lightest luminance included in color analysis"
              style={{ "--fill": `${((toneWhite - 1) / 254) * 100}%` }}
              onChange={event => {
                const nextWhite = Math.max(Number(event.target.value), toneBlack + 1);
                useAppStore.getState().setToneRange(toneBlack, nextWhite);
                useAppStore.getState().recomputeHistogram();
                queuePosterize();
              }}
            />
          </label>
        </div>
      </div>
      <p className="hint">Click the graph or add a point, then drag its anchor and Bézier handles. The range sliders exclude pixels that are too dark or too light before palette analysis.</p>
    </div>
  );
}
