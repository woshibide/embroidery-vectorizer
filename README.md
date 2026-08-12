# Raster to layered SVG

Drop a PNG, JPG, or JPEG into the page to posterize it and export named SVG color layers. The default preview is loaded from `example.png`.

The project is a build-free static site. To publish it with GitHub Pages, serve the repository root from the branch of your choice; no Actions workflow is required.



## Dithering

Every palette color has an expandable Edge control against white/transparent space. Halftone keeps a hard edge and its vertical handle can add up to 32 pixels of real mask overlay beyond the midpoint. Dither applies Floyd–Steinberg error diffusion to that color’s edge, with vertical handles setting the color and white reach limits.

Calculation mode cycles through Auto, Semi · 3s, and Manual. Semi-auto coalesces edits behind a three-second countdown shown directly on the Recalculate button before starting the normal calculation progress.

## Layer grouping

Click palette rows to select layers, then use the sticky Merge action to turn two or more colors into one logical output layer. Drag the ⋮ handles (or use their arrow keys) to reorder individual layers and merged groups. Each member keeps its own Edge control, while the merged layer has an additional group-level Edge control. Choosing a representative color repaints the whole group in Posterized and Layers views and in SVG output without overwriting the member colors. In Layers view, dragging any member moves the whole group. The × control returns the members to separate layers without changing their colors or order.
