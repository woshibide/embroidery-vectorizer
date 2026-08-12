import { useAppStore } from "../store/useAppStore.js";
import { validLayerGroup, effectiveMask, effectivePath, layerRenderHex, getLayerUnits } from "../lib/layers.js";

export function fitArtwork(p) {
  const { width, height } = useAppStore.getState();
  if (!width || !p) return;
  const margin = 72;
  let fitScale = Math.min((p.width - margin * 2) / width, (p.height - margin * 2) / height);
  fitScale = Math.max(.05, fitScale);
  useAppStore.setState({
    fitScale,
    scale: fitScale,
    offsetX: p.width / 2,
    offsetY: p.height / 2
  });
  p.redraw();
}

export function zoomBy(p, factor, cx, cy) {
  if (!p) return;
  const { scale: oldScale, fitScale, offsetX, offsetY } = useAppStore.getState();
  const nextScale = Math.min(fitScale * 32, Math.max(fitScale * .2, oldScale * factor));
  const x = cx ?? p.width / 2;
  const y = cy ?? p.height / 2;
  useAppStore.setState({
    offsetX: x - (x - offsetX) * (nextScale / oldScale),
    offsetY: y - (y - offsetY) * (nextScale / oldScale),
    scale: nextScale
  });
  p.redraw();
}

export function zoomReadoutLabel(scale, fitScale) {
  return Math.abs(scale - fitScale) < .001 ? "Fit" : `${Math.round((scale / fitScale) * 100)}%`;
}

export function artworkPoint(p) {
  const { offsetX, offsetY, width, height, scale } = useAppStore.getState();
  const originX = offsetX - (width * scale) / 2;
  const originY = offsetY - (height * scale) / 2;
  return { x: (p.mouseX - originX) / scale, y: (p.mouseY - originY) / scale };
}

export function dragLayersFor(layer) {
  const { layers, layerGroups } = useAppStore.getState();
  const group = validLayerGroup(layer, layerGroups);
  return group ? layers.filter(candidate => candidate.groupId === group.id) : [layer];
}

export function layerAtPoint(p) {
  const { view, layers, layerGroups, width, height } = useAppStore.getState();
  if (view !== "overlay") return null;
  const point = artworkPoint(p);
  const ordered = [...layers].sort((a, b) => (b.z || 0) - (a.z || 0));
  for (const layer of ordered) {
    const x = Math.floor(point.x - (layer.dragX || 0));
    const y = Math.floor(point.y - (layer.dragY || 0));
    if (x >= 0 && y >= 0 && x < width && y < height && effectiveMask(layer, layerGroups)?.[y * width + x]) return layer;
  }
  return null;
}

export function insideCanvas(p) {
  return p.mouseX >= 0 && p.mouseY >= 0 && p.mouseX <= p.width && p.mouseY <= p.height;
}

export function drawBackground(p) {
  p.background(255);
  const size = 18;
  p.noStroke();
  for (let y = 0; y < p.height; y += size) {
    for (let x = 0; x < p.width; x += size) {
      p.fill(((x / size + y / size) % 2) ? 255 : 252, ((x / size + y / size) % 2) ? 255 : 240, ((x / size + y / size) % 2) ? 255 : 237);
      p.rect(x, y, size, size);
    }
  }
}

export function drawSplitView(p, x, y) {
  const { image, posterCanvas, width, height, scale } = useAppStore.getState();
  const ctx = p.drawingContext;
  const midX = p.width / 2;
  const posterSource = posterCanvas || image;
  const w = width * scale;
  const h = height * scale;
  ctx.imageSmoothingEnabled = false;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, midX, p.height);
  ctx.clip();
  ctx.drawImage(image, x, y, w, h);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(midX, 0, p.width - midX, p.height);
  ctx.clip();
  ctx.drawImage(posterSource, x, y, w, h);
  ctx.restore();
}

export function drawLayer(p, layer, layerGroups) {
  const path = effectivePath(layer, layerGroups);
  if (!path) return;
  const context = p.drawingContext;
  context.save();
  context.translate(layer.dragX || 0, layer.dragY || 0);
  context.fillStyle = layerRenderHex(layer, layerGroups);
  try { context.fill(new Path2D(path), "evenodd"); }
  catch (_) { context.fill(new Path2D(path)); }
  context.restore();
}

// Builds the p5 instance-mode sketch. All transient pointer/drag state
// (dragging, activeLayer, lastX/lastY) lives in closures here — never in the
// Zustand store — so mouse-move frames never trigger a React re-render.
// `callbacks.setStatusText(text)` and `callbacks.setWrapClass(name, active)`
// are the only ways this sketch talks back to the host component/DOM.
export function buildSketch(wrapperEl, callbacks) {
  const { setStatusText, setWrapClass } = callbacks;
  let dragging = false;
  let activeLayer = null;
  let lastX = 0;
  let lastY = 0;

  return p => {
    p.setup = () => {
      const rect = wrapperEl.getBoundingClientRect();
      const canvas = p.createCanvas(Math.max(1, rect.width), Math.max(1, rect.height));
      canvas.parent(wrapperEl);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.noLoop();
      fitArtwork(p);
    };
    p.windowResized = () => {
      const rect = wrapperEl.getBoundingClientRect();
      p.resizeCanvas(Math.max(1, rect.width), Math.max(1, rect.height));
      fitArtwork(p);
    };
    p.draw = () => {
      drawBackground(p);
      const { ready, image, offsetX, offsetY, width, height, scale, view, posterCanvas, layers, layerGroups } = useAppStore.getState();
      if (!ready || !image) return;
      const x = offsetX - (width * scale) / 2;
      const y = offsetY - (height * scale) / 2;
      if (view === "split") {
        drawSplitView(p, x, y);
        return;
      }
      p.push();
      p.translate(x, y);
      p.scale(scale);
      p.drawingContext.imageSmoothingEnabled = false;
      if (view === "original") {
        p.drawingContext.drawImage(image, 0, 0, width, height);
      } else if (view === "vector") {
        if (posterCanvas) p.drawingContext.drawImage(posterCanvas, 0, 0);
        else p.drawingContext.drawImage(image, 0, 0, width, height);
      } else {
        const ordered = [...layers].sort((a, b) => (a.z || 0) - (b.z || 0));
        for (const layer of ordered) drawLayer(p, layer, layerGroups);
      }
      p.pop();
    };
    p.mousePressed = () => {
      if (!insideCanvas(p)) return;
      const hit = layerAtPoint(p);
      if (hit) {
        const layers = dragLayersFor(hit);
        activeLayer = { hit, layers, raised: false, moved: 0 };
        lastX = p.mouseX;
        lastY = p.mouseY;
        setWrapClass("is-dragging-layer", true);
        setStatusText(layers.length > 1 ? `Moving merged layer · ${layers.length} colors` : `Moving ${hit.name}`);
        p.redraw();
        return;
      }
      dragging = true;
      lastX = p.mouseX;
      lastY = p.mouseY;
      setWrapClass("is-panning", true);
    };
    p.mouseDragged = () => {
      if (activeLayer) {
        const pixelDx = p.mouseX - lastX;
        const pixelDy = p.mouseY - lastY;
        activeLayer.moved += Math.hypot(pixelDx, pixelDy);
        if (!activeLayer.raised && activeLayer.moved < 3) {
          lastX = p.mouseX;
          lastY = p.mouseY;
          return;
        }
        if (!activeLayer.raised) {
          const allLayers = useAppStore.getState().layers;
          const maxZ = Math.max(0, ...allLayers.map(layer => layer.z || 0));
          activeLayer.layers.forEach((layer, index) => { layer.z = maxZ + index + 1; });
          activeLayer.raised = true;
        }
        const { scale } = useAppStore.getState();
        const dx = pixelDx / scale;
        const dy = pixelDy / scale;
        for (const layer of activeLayer.layers) {
          layer.dragX += dx;
          layer.dragY += dy;
        }
        lastX = p.mouseX;
        lastY = p.mouseY;
        p.redraw();
        return;
      }
      if (!dragging) return;
      const { offsetX, offsetY } = useAppStore.getState();
      useAppStore.setState({ offsetX: offsetX + (p.mouseX - lastX), offsetY: offsetY + (p.mouseY - lastY) });
      lastX = p.mouseX;
      lastY = p.mouseY;
      p.redraw();
    };
    p.mouseReleased = () => {
      if (activeLayer) {
        const { layers, layerGroups } = useAppStore.getState();
        const outputCount = getLayerUnits(layers, layerGroups).length;
        setStatusText(`${outputCount} separated output layer${outputCount === 1 ? "" : "s"}`);
      }
      activeLayer = null;
      dragging = false;
      setWrapClass("is-panning", false);
      setWrapClass("is-dragging-layer", false);
    };
    p.mouseMoved = () => {
      const { view } = useAppStore.getState();
      if (view !== "overlay" || activeLayer) return;
      setWrapClass("is-over-layer", Boolean(layerAtPoint(p)));
    };
    p.mouseWheel = event => {
      if (!insideCanvas(p)) return true;
      zoomBy(p, event.deltaY > 0 ? .88 : 1.14, p.mouseX, p.mouseY);
      return false;
    };
  };
}
