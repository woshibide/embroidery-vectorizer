import { useEffect, useRef } from "react";
import p5 from "p5";
import { useAppStore } from "../store/useAppStore.js";
import { buildSketch } from "./engine.js";

// Owns the entire p5 lifecycle. Redraws are triggered IMPERATIVELY via a
// Zustand subscription (not the reactive useStore() hook) — the canvas is
// not React-rendered DOM, so there is nothing for React to reconcile here.
// The only reactive value read is `view`, purely to conditionally render the
// split-view divider/label DOM overlays as real JSX siblings of the canvas.
export default function CanvasStage({ onSketchReady }) {
  const wrapRef = useRef(null);
  const sketchRef = useRef(null);
  const view = useAppStore(state => state.view);

  useEffect(() => {
    const wrapperEl = wrapRef.current;
    const setWrapClass = (name, active) => wrapperEl.classList.toggle(name, active);
    const setStatusText = text => useAppStore.getState().setStatusText(text);

    const sketch = new p5(buildSketch(wrapperEl, { setStatusText, setWrapClass }), wrapperEl);
    sketchRef.current = sketch;
    onSketchReady?.(sketch);

    const unsubscribe = useAppStore.subscribe(
      state => [state.view, state.layers, state.scale, state.offsetX, state.offsetY, state.posterCanvas, state.image, state.ready],
      () => sketchRef.current?.redraw()
    );

    return () => {
      unsubscribe();
      sketch.remove();
      sketchRef.current = null;
      onSketchReady?.(null);
    };
  }, []);

  useEffect(() => {
    wrapRef.current?.classList.toggle("is-layer-mode", view === "overlay");
  }, [view]);

  return (
    <div ref={wrapRef} id="canvas-wrap" aria-label="Pannable p5.js preview canvas">
      {view === "split" && (
        <>
          <div className="split-divider" aria-hidden="true" />
          <div className="split-label split-label-left" aria-hidden="true">Original</div>
          <div className="split-label split-label-right" aria-hidden="true">Posterized</div>
        </>
      )}
    </div>
  );
}
