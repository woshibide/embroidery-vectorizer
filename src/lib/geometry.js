function pointKey(x, y) { return `${x},${y}`; }
function edgeKey(edge) { return `${edge.x1},${edge.y1}>${edge.x2},${edge.y2}`; }

function direction(a, b) {
  if (b.x > a.x) return 0;
  if (b.y > a.y) return 1;
  if (b.x < a.x) return 2;
  return 3;
}

export function simplifyLoop(points) {
  if (points.length < 4) return points;
  const pts = points.slice();
  if (pts[0].x === pts.at(-1).x && pts[0].y === pts.at(-1).y) pts.pop();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = pts.length - 1; i >= 0; i--) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
        pts.splice(i, 1);
        changed = true;
      }
    }
  }
  return pts;
}

// Pixel-union boundary tracing. Four-connected islands stay separate and holes
// are preserved by the even-odd fill rule used in every exported SVG.
export function traceMask(mask, width, height) {
  const outgoing = new Map();
  const edges = [];
  const addEdge = (x1, y1, x2, y2, dir) => {
    const edge = { x1, y1, x2, y2, dir };
    edges.push(edge);
    const key = pointKey(x1, y1);
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(edge);
  };
  const filled = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) addEdge(x, y, x + 1, y, 0);
      if (!filled(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1, 1);
      if (!filled(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1, 2);
      if (!filled(x - 1, y)) addEdge(x, y + 1, x, y, 3);
    }
  }

  const used = new Set();
  const loops = [];
  const turnRank = [1, 0, 3, 2];
  for (const first of edges) {
    if (used.has(edgeKey(first))) continue;
    const loop = [{ x: first.x1, y: first.y1 }];
    let edge = first;
    let guard = 0;
    while (edge && guard++ <= edges.length + 1) {
      used.add(edgeKey(edge));
      loop.push({ x: edge.x2, y: edge.y2 });
      if (edge.x2 === first.x1 && edge.y2 === first.y1) break;
      const candidates = (outgoing.get(pointKey(edge.x2, edge.y2)) || [])
        .filter(candidate => !used.has(edgeKey(candidate)));
      const previousDirection = direction(loop[loop.length - 2], loop[loop.length - 1]);
      edge = null;
      for (const turn of turnRank) {
        const found = candidates.find(candidate => ((candidate.dir - previousDirection + 4) % 4) === turn);
        if (found) { edge = found; break; }
      }
    }
    if (loop.length >= 4 && loop[0].x === loop.at(-1).x && loop[0].y === loop.at(-1).y) {
      loops.push(simplifyLoop(loop));
    }
  }
  return loops;
}

function fmt(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "");
}

export function loopToPath(points, smoothPercent) {
  if (points.length < 3) return "";
  if (smoothPercent <= 0) return `M${points.map(point => `${point.x} ${point.y}`).join("L")}Z`;
  const t = Math.min(.48, smoothPercent / 100);
  const entries = [];
  const exits = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const point = points[i];
    const next = points[(i + 1) % points.length];
    entries.push({ x: point.x + (prev.x - point.x) * t, y: point.y + (prev.y - point.y) * t });
    exits.push({ x: point.x + (next.x - point.x) * t, y: point.y + (next.y - point.y) * t });
  }
  let path = `M${fmt(entries[0].x)} ${fmt(entries[0].y)}Q${fmt(points[0].x)} ${fmt(points[0].y)} ${fmt(exits[0].x)} ${fmt(exits[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    path += `L${fmt(entries[i].x)} ${fmt(entries[i].y)}Q${fmt(points[i].x)} ${fmt(points[i].y)} ${fmt(exits[i].x)} ${fmt(exits[i].y)}`;
  }
  return `${path}L${fmt(entries[0].x)} ${fmt(entries[0].y)}Z`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
