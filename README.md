# Raster to layered SVG

Drop a PNG, JPG, or JPEG into the page to posterize it and export named SVG color layers. The default preview is loaded from `example.png`.

The project is a build-free static site. To publish it with GitHub Pages, serve the repository root from the branch of your choice; no Actions workflow is required.



## Dithering

Every palette color has an expandable Edge control against white/transparent space. Halftone keeps a hard edge and its vertical handle can add up to 32 pixels of real mask overlay beyond the midpoint. Dither applies Floyd–Steinberg error diffusion to that color’s edge, with vertical handles setting the color and white reach limits.
