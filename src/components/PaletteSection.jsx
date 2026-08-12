import { useRef } from "react";
import { useAppStore } from "../store/useAppStore.js";
import {
  toggleLayerSelection,
  mergeSelectedLayers,
  addLayerToGroup,
  unmergeLayerGroup,
  moveLayerUnitRelative,
  moveLayerUnitByKeyboard,
  refreshLayerRendering
} from "../store/actions.js";
import { getLayerUnits, layerId, getGroupEdgeTarget } from "../lib/layers.js";
import { layoutTreemap } from "../lib/treemap.js";
import { hexToRgb } from "../lib/color.js";
import { downloadZIP, copyCombinedSVG } from "../lib/exportActions.js";
import EdgeTransitionPanel from "./EdgeTransitionPanel.jsx";
import { IconMerge, IconPlus, IconClose, IconDownload, IconCopy, IconExpand, IconCollapse, IconDrag } from "./icons.jsx";

async function copyHex(hex) {
  try {
    await navigator.clipboard.writeText(hex);
  } catch (_) {
    const area = document.createElement("textarea");
    area.value = hex;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

function ColorSwatchButton({ className, style, layer, share }) {
  const percent = `${(share * 100).toFixed(1)}%`;
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={`${layer.name}, ${layer.hex}, ${percent}. Copy hex value`}
      onPointerEnter={event => useAppStore.getState().showColorTooltip?.(layer.hex, event.clientX, event.clientY)}
      onPointerMove={event => useAppStore.getState().moveColorTooltip?.(event.clientX, event.clientY)}
      onPointerLeave={() => useAppStore.getState().hideColorTooltip?.()}
      onFocus={event => {
        const rect = event.target.getBoundingClientRect();
        useAppStore.getState().showColorTooltip?.(layer.hex, rect.left + rect.width / 2, rect.top);
      }}
      onBlur={() => useAppStore.getState().hideColorTooltip?.()}
      onClick={async () => {
        await copyHex(layer.hex);
        useAppStore.getState().hideColorTooltip?.();
        useAppStore.getState().showToast(`${layer.hex} copied`);
      }}
    />
  );
}

function PaletteItem({ layer, total, selectable }) {
  const share = layer.pixels / total;
  const selectedLayerIds = useAppStore(state => state.selectedLayerIds);
  const selected = selectedLayerIds.has(layerId(layer));
  const Tag = selectable ? "button" : "div";
  return (
    <Tag
      className="palette-item"
      type={selectable ? "button" : undefined}
      data-layer-id={layerId(layer)}
      aria-pressed={selectable ? selected : undefined}
      aria-label={selectable ? `${selected ? "Deselect" : "Select"} ${layer.name} layer, ${layer.hex}` : undefined}
      onClick={selectable ? () => toggleLayerSelection(layer) : undefined}
    >
      <span className="palette-swatch-wrap"><span className="palette-swatch" style={{ backgroundColor: layer.hex }} /></span>
      <span className="palette-name">{layer.name}</span>
      <span className="palette-hex">{layer.hex}</span>
      <span className="palette-share">{share < .001 ? "<0.1%" : `${(share * 100).toFixed(1)}%`}</span>
    </Tag>
  );
}

function GroupColorControl({ unit, edgeTarget }) {
  const group = unit.group;
  return (
    <label
      className={`palette-group-color${group.representativeHex ? " has-color" : ""}`}
      style={group.representativeHex ? { backgroundColor: group.representativeHex } : undefined}
      title={group.representativeHex ? `Representative color ${group.representativeHex}` : "Representative color is transparent · Click to choose"}
    >
      <input
        type="color"
        value={group.representativeHex || unit.layers[0].hex}
        aria-label={group.representativeHex
          ? `Representative color for merged layer of ${unit.layers.length} colors: ${group.representativeHex}`
          : `Choose representative color for merged layer of ${unit.layers.length} colors; currently transparent and not set`}
        onInput={event => {
          const hex = event.target.value.toUpperCase();
          group.representativeHex = hex;
          edgeTarget.hex = hex;
          edgeTarget.rgb = hexToRgb(hex);
          useAppStore.setState({ layerGroups: new Map(useAppStore.getState().layerGroups) });
          refreshLayerRendering();
        }}
        onChange={() => useAppStore.getState().showToast(`${group.representativeHex} set as representative color`)}
      />
    </label>
  );
}

function StatsRow() {
  const nodes = useAppStore(state => state.nodeCount ?? "—");
  const pixels = useAppStore(state => state.visiblePixelCount ?? "—");
  const layers = useAppStore(state => state.layers);
  const layerGroups = useAppStore(state => state.layerGroups);
  const outputCount = layers.length ? getLayerUnits(layers, layerGroups).length : "—";
  return (
    <div className="stats">
      <div className="stat"><span className="stat-label">Layers</span><span className="stat-value">{outputCount}</span></div>
      <div className="stat"><span className="stat-label">Nodes</span><span className="stat-value">{nodes}</span></div>
      <div className="stat"><span className="stat-label">Pixels</span><span className="stat-value">{pixels}</span></div>
    </div>
  );
}

function PaletteVisualRow() {
  const layers = useAppStore(state => state.layers);
  const width = useAppStore(state => state.width);
  const height = useAppStore(state => state.height);
  const heatmapExpanded = useAppStore(state => state.heatmapExpanded);
  const total = layers.reduce((sum, layer) => sum + layer.pixels, 0) || 1;
  const areas = layoutTreemap(layers);

  return (
    <>
      <div className="palette-visual-row">
        <div className="palette-share-bar" aria-label="Proportion of each extracted color">
          {layers.map(layer => {
            const share = layer.pixels / total;
            return (
              <ColorSwatchButton
                key={layerId(layer)}
                className="palette-share-segment"
                style={{ width: `${share * 100}%`, backgroundColor: layer.hex }}
                layer={layer}
                share={share}
              />
            );
          })}
        </div>
        <button
          className="palette-expand"
          type="button"
          aria-expanded={heatmapExpanded}
          aria-controls="palette-heatmap"
          aria-label={heatmapExpanded ? "Collapse color heat map" : "Expand color heat map"}
          title={heatmapExpanded ? "Collapse color heat map" : "Expand color heat map"}
          onClick={() => useAppStore.getState().setHeatmapExpanded(!heatmapExpanded)}
        >{heatmapExpanded ? <IconCollapse /> : <IconExpand />}</button>
      </div>
      <div
        className="palette-heatmap"
        id="palette-heatmap"
        hidden={!heatmapExpanded}
        style={{ aspectRatio: width && height ? `${width} / ${height}` : "1 / 1" }}
        aria-label={layers.length
          ? `Color area heat map matching the ${width} by ${height} source image; rectangle areas show each color's share`
          : "Color area heat map awaiting calculation"}
      >
        {areas.map(area => {
          const share = area.layer.pixels / total;
          return (
            <ColorSwatchButton
              key={layerId(area.layer)}
              className="palette-heat-cell"
              style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.width}%`, height: `${area.height}%`, backgroundColor: area.layer.hex }}
              layer={area.layer}
              share={share}
            />
          );
        })}
      </div>
    </>
  );
}

function MergeBar() {
  const selectedLayerIds = useAppStore(state => state.selectedLayerIds);
  const count = selectedLayerIds.size;
  if (count < 2) return null;
  return (
    <div className="palette-merge-bar">
      <button
        className="palette-merge-button"
        type="button"
        aria-label={`Merge ${count} selected layer${count === 1 ? "" : "s"}`}
        onClick={() => mergeSelectedLayers()}
      >
        <span className="palette-merge-label"><IconMerge className="palette-merge-icon" />Merge selected</span>
        <span className="palette-merge-count">{count}</span>
      </button>
    </div>
  );
}

function DragHandle({ unitKey, label, listRef }) {
  const dragState = useRef(null);
  return (
    <button
      className="palette-drag-handle"
      type="button"
      data-unit-key={unitKey}
      aria-label={`Reorder ${label}. Drag, or use arrow keys.`}
      title="Drag to reorder · Arrow keys move"
      onPointerDown={event => {
        if (useAppStore.getState().calculating || (event.button !== undefined && event.button !== 0)) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        const element = event.currentTarget.closest(".palette-output-unit");
        dragState.current = { pointerId: event.pointerId, startY: event.clientY, moved: false, targetKey: null, position: "before", element };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const drag = dragState.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.moved && Math.abs(event.clientY - drag.startY) < 4) return;
        drag.moved = true;
        drag.element.classList.add("is-dragging");
        const list = listRef.current;
        if (!list) return;
        list.querySelectorAll(".is-drop-before, .is-drop-after").forEach(el => el.classList.remove("is-drop-before", "is-drop-after"));
        const candidates = Array.from(list.querySelectorAll(".palette-output-unit")).filter(el => el.dataset.unitKey !== unitKey);
        if (!candidates.length) { drag.targetKey = null; return; }
        let target = candidates.find(el => event.clientY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2);
        let position = "before";
        if (!target) { target = candidates.at(-1); position = "after"; }
        target.classList.add(position === "before" ? "is-drop-before" : "is-drop-after");
        drag.targetKey = target.dataset.unitKey;
        drag.position = position;
      }}
      onPointerUp={event => {
        const drag = dragState.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        drag.element.classList.remove("is-dragging");
        listRef.current?.querySelectorAll(".is-drop-before, .is-drop-after").forEach(el => el.classList.remove("is-drop-before", "is-drop-after"));
        dragState.current = null;
        if (drag.moved && drag.targetKey) moveLayerUnitRelative(unitKey, drag.targetKey, drag.position);
      }}
      onPointerCancel={() => {
        const drag = dragState.current;
        if (drag) {
          drag.element.classList.remove("is-dragging");
          listRef.current?.querySelectorAll(".is-drop-before, .is-drop-after").forEach(el => el.classList.remove("is-drop-before", "is-drop-after"));
        }
        dragState.current = null;
      }}
      onKeyDown={event => {
        const destination = { ArrowUp: -1, ArrowDown: 1, Home: "first", End: "last" }[event.key];
        if (destination === undefined) return;
        event.preventDefault();
        moveLayerUnitByKeyboard(unitKey, destination);
      }}
    ><IconDrag /></button>
  );
}

function PaletteUnit({ unit, total, listRef }) {
  const selectedLayerIds = useAppStore(state => state.selectedLayerIds);
  const canAddToGroup = selectedLayerIds.size === 1;
  if (unit.type === "layer") {
    const layer = unit.layer;
    return (
      <div className="palette-output-unit" data-unit-key={unit.key} role="listitem">
        <div className="palette-row-shell">
          <PaletteItem layer={layer} total={total} selectable />
          <DragHandle unitKey={unit.key} label={layer.name} listRef={listRef} />
        </div>
        <EdgeTransitionPanel target={layer} panelIndex={unit.key} />
      </div>
    );
  }
  const groupEdgeTarget = getGroupEdgeTarget(unit);
  return (
    <div className="palette-output-unit palette-group-unit" data-unit-key={unit.key} role="listitem">
      <div className="palette-group" style={{ "--group-member-count": unit.layers.length }} role="group" aria-label={`Merged layer containing ${unit.layers.length} colors`}>
        <GroupColorControl unit={unit} edgeTarget={groupEdgeTarget} />
        <div className="palette-group-actions">
          <DragHandle unitKey={unit.key} label={`merged layer of ${unit.layers.length} colors`} listRef={listRef} />
          <button
            className="palette-group-add"
            type="button"
            data-group-id={unit.group.id}
            disabled={!canAddToGroup}
            title="Add selected color to this merged layer"
            aria-label={canAddToGroup ? "Add selected color to this merged layer" : "Select exactly one color to add it to this merged layer"}
            onClick={() => addLayerToGroup(unit.group.id)}
          ><IconPlus /></button>
          <button
            className="palette-group-remove"
            type="button"
            data-group-id={unit.group.id}
            aria-label={`Remove merged state from ${unit.layers.length} colors`}
            title="Remove merged state"
            onClick={() => unmergeLayerGroup(unit.group.id)}
          ><IconClose /></button>
        </div>
        <div className="palette-group-members">
          {unit.layers.map(layer => (
            <div key={layerId(layer)} className="palette-group-member" role="group" aria-label={`${layer.name}, ${layer.hex}`}>
              <PaletteItem layer={layer} total={total} selectable={false} />
              <EdgeTransitionPanel target={layer} panelIndex={`${unit.key}-${layerId(layer)}`} />
            </div>
          ))}
        </div>
        <div className="palette-group-edge">
          <EdgeTransitionPanel target={groupEdgeTarget} panelIndex={`group-${unit.group.id}`} />
        </div>
      </div>
    </div>
  );
}

export default function PaletteSection() {
  const layers = useAppStore(state => state.layers);
  const layerGroups = useAppStore(state => state.layerGroups);
  const name = useAppStore(state => state.name);
  const width = useAppStore(state => state.width);
  const height = useAppStore(state => state.height);
  const smooth = useAppStore(state => state.smooth);
  const ready = useAppStore(state => state.ready);
  const listRef = useRef(null);
  const total = layers.reduce((sum, layer) => sum + layer.pixels, 0) || 1;
  const units = getLayerUnits(layers, layerGroups);
  const doc = { name, width, height, smooth, layerGroups };

  return (
    <section className="section" aria-labelledby="output-title">
      <h2 className="section-title" id="output-title"><span>Layer output</span><span className="section-number">02</span></h2>
      <StatsRow />
      <PaletteVisualRow />
      <p className="palette-guide">Click layers to select · drag ⋮ to reorder</p>
      <MergeBar />
      <div className="palette" id="palette" role="list" aria-label="Extracted color layers" ref={listRef}>
        {units.map(unit => <PaletteUnit key={unit.key} unit={unit} total={total} listRef={listRef} />)}
      </div>
      <div className="export-row">
        <button
          className="button button-primary"
          type="button"
          disabled={!ready || !layers.length}
          onClick={() => {
            useAppStore.getState().setStatusText("Packing ZIP");
            const unitCount = downloadZIP(layers, doc);
            useAppStore.getState().setStatusText(`${unitCount} output layer${unitCount === 1 ? "" : "s"}`);
            useAppStore.getState().showToast(`${unitCount} SVG output layer${unitCount === 1 ? "" : "s"} downloaded`);
          }}
        ><IconDownload className="button-icon" />Download layers .zip</button>
        <button
          className="button button-secondary"
          type="button"
          aria-label="Copy combined SVG to clipboard"
          title="Copy combined SVG"
          disabled={!ready}
          onClick={async () => {
            await copyCombinedSVG(layers, doc);
            useAppStore.getState().showToast("Combined SVG copied");
          }}
        ><IconCopy /></button>
      </div>
    </section>
  );
}
