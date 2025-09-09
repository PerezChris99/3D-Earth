# 3D-Earth

A lightweight, browser-based 3D Earth visualizer with satellites, atmosphere, day/night lighting, and configurable UI controls.

This README documents both what you see on the page and what runs under the hood so you — or other developers — can understand, run, and extend the project.

---

## Quick start

Open a simple static server in the project folder and navigate to http://localhost:8000

PowerShell (recommended):

```powershell
# From the project folder (Windows PowerShell)
python -m http.server 8000
# or with Node (if you prefer):
npx http-server -p 8000
```

Then open http://localhost:8000 in your browser.

Files of primary interest:
- `index.html` — application shell and UI markup
- `style.css` — page and UI styling
- `script.js` — main application logic (rendering, scene setup, UI wiring)
- `sgp4-worker.js` — optional Web Worker for SGP4 satellite propagation

---

## High-level overview — what you're seeing

When the app runs, you should see a fullscreen WebGL canvas rendering a 3D planet with:

- The Earth sphere textured with diffuse, bump/normal, and specular maps (day textures).
- A semi-transparent cloud layer that rotates slightly faster than the globe.
- A volumetric-like atmosphere (Rayleigh + Mie approximation) implemented in a three.js `ShaderMaterial` (BackSide) that provides a soft scattering effect around the globe.
- Day/night shading with a night-lights overlay shader that uses an Earth-night texture and a `u_sunDir` uniform to determine the dark side.
- A starfield of points placed at large distances to provide depth and a space-like backdrop.
- Satellites represented as GPU points; a specific ISS model placeholder is present (and optionally loaded via GLTF), and many synthetic satellites populate orbit bands for visual density.
- A simple moon placeholder orbiting the scene.
- A directional sun and adaptive ambient lighting to simulate day/night intensity changes.

Controls are available in a compact panel (top-right by default). Controls include toggles for satellites, currents, moon, magnetic field, PBR material, atmosphere on/off, atmosphere exposure (range), night glow (range), fade height, real-time vs. manual time with a datetime input, and a Reset button that restores the initial camera view.

There is also a small, unobtrusive footer credit link: `by https://perezchris.netlify.app/`.

---

## High-level overview — what you don't see (internals)

This section documents the main architectural pieces, libraries used, and non-obvious runtime behavior.

### Libraries & external assets
- three.js (r128) — 3D renderer, materials, geometries, `OrbitControls`, `GLTFLoader`.
- satellite.js — SGP4 propagation library (used either inside the main thread or inside the worker).
- Optional GLTF ISS model loaded via `GLTFLoader` when available.
- Textures are loaded from threejs example assets or fallback generated canvases when remote textures fail.

### Satellite propagation (SGP4)
- The project tries to use a Web Worker (`sgp4-worker.js`) to offload SGP4 propagation and keep the main thread responsive.
- If a Worker cannot be created or `satellite.js` is not available inside it, the code falls back to a main-thread propagation path implemented with `satellite.js`.
- Propagation updates produce ECI/Geodetic positions which are converted to a normalized, scene-space radius (slightly above the globe) and written into Float32 buffers.
- There are two double-buffers (`prevSatBuffer` and `nextSatBuffer`) that hold consecutive position snapshots. The GPU shader interpolates between these via a uniform `u_interp` to produce smooth motion without updating individual vertices each frame.

### GPU smoothing for many satellites
- Satellites are rendered as `THREE.Points` with a custom `ShaderMaterial`.
- The vertex shader mixes `a_posPrev` and `a_posNext` by `u_interp` to compute current position. This allows the worker/main thread to update the `next` buffer periodically while the GPU renders smoothly between updates.
- For fallback cases (small synthetic sets), a standard `position` attribute is used.

### Atmosphere shader (Rayleigh + Mie approximation)
- The atmosphere is a `ShaderMaterial` on a slightly larger sphere (BackSide) with uniforms:
  - `u_sunDir` — sun direction (ECEF) used to shade the atmosphere and compute day/night transitions
  - `u_cameraPos` — used to compute view-dependent effects and camera height fading
  - `u_exposure` — controls scattering intensity (driven by the `range-atmo` control)
  - `u_betaR`, `u_betaM`, `u_g` — scattering coefficients and Henyey–Greenstein asymmetry parameter
  - `u_fadeHeight` — camera altitude fade parameter, controls how the atmosphere fades with camera distance
  - `u_skyColor`, `u_nightGlow` — tint and night glow amplitude
- The shader computes an approximate single-scattering result that blends Rayleigh and Mie contributions, adds limb accents, and applies a gamma curve to presentable color.

### Night-lights shader
- A separate sphere slightly above the globe uses a shader that samples an Earth-night texture and blends it based on the dot product between surface normal and sun direction, producing lighted city areas visible on the night side.
- This shader is additive and respects the day/night weighting calculated from the sun vector.

### Starfield, moon, and sun
- Starfield is a `Points` cloud placed far away to simulate space depth; it is static and inexpensive.
- Moon is a simple sphere with rough material and is positioned by a crude lunar approximation function for visual effect (not astrodynamically precise).
- Sun is represented by a small emissive sphere plus a `DirectionalLight` that illuminates the globe. The sun position is computed from a simple solar algorithm using Julian dates and rotated into ECEF coordinates.

### Camera, controls, and Reset logic
- `OrbitControls` provides the primary camera UX. On init we snapshot the camera position, `controls.target`, and camera FOV into `initialCameraState`. The `Reset` button restores those values precisely.
- There is also an ISS-follow mode that will save the previous camera view and smoothly transition the camera to an orbiting follow of the ISS placeholder — Reset does not automatically cancel follow unless requested.

### Resilience & fallbacks
- Textures have a fallback: if remote textures fail to load, an in-memory canvas is used as a simple substitute to keep visuals functional.
- SGP4 uses a worker when available; otherwise it uses main-thread propagation. If TLE fetch fails, a synthetic set of satellites is created so the scene isn’t empty.
- The renderer is created with `alpha: true` and `renderer.setClearColor(0x000000, 0)` so the canvas is transparent and the document body gradient shows through (provides the space background if CSS is present).

---

## Data flows & key variables

- `tleData` — parsed TLE name/two-line entries fetched from CelesTrak (or synthetic fallback)
- `sgp4Worker` — optional worker instance used to compute satellite positions off-main-thread
- `prevSatBuffer`, `nextSatBuffer` — Float32Array double-buffers for GPU interpolation
- `tlePoints` — `THREE.Points` used to render SGP4-derived satellites with `a_posPrev` / `a_posNext` attributes
- `syntheticPoints` — fallback `THREE.Points` for synthetic satellite set
- `atmosphere` — Mesh with ShaderMaterial for scattering
- `nightMesh` / `nightMaterial` — sphere + shader for night-lights

---

## UI controls and IDs (so you can script or style them)

Key UI element IDs kept stable for scripting in `script.js`:
- `controls` — outer controls panel
- `controls-hamburger` — mobile hamburger toggle
- `btn-follow-iss` — follow/stop follow ISS button
- `chk-iss` — ISS visibility toggle
- `chk-satellites` — show/hide satellites
- `chk-currents` — ocean currents toggle
- `chk-moon` — moon toggle
- `chk-magnetic` — magnetic field toggle
- `chk-pbr` — PBR Earth material toggle
- `range-atmo` — atmosphere exposure slider
- `chk-atmosphere` — atmosphere on/off
- `range-night` — night glow slider
- `range-fade` — atmosphere fade-height slider
- `chk-realtime` — real-time / manual time toggle
- `inp-datetime` — manual datetime input

There is also an on-screen `#ui-debug` area used during development to display current control values and shader uniform values.

---

## Running & developing

1. Start a local static server (see Quick start).
2. Open DevTools (F12) and watch the Console: texture, TLE, and worker messages appear there.
3. If satellite updates aren’t appearing, check network access to `https://celestrak.com/NORAD/elements/active.txt` and whether `sgp4-worker.js` successfully loaded and posted a `ready` message.
4. To debug shader values, the `#ui-debug` panel displays current slider values and the atmosphere uniforms.

### Editing code
- `script.js` is intentionally organized as a single-file demo for portability. When making edits:
  - Keep UI element IDs stable if you modify `index.html` so `script.js` can find them without changes.
  - If you adjust the atmosphere shader uniforms, ensure default values in the `createEarth()` function are consistent with the UI ranges.

### Common troubleshooting
- White page / no background: ensure `style.css` is present and loaded; the renderer is transparent so the document background provides the space gradient.
- Worker not launching: check browser security settings (Workers require file served via HTTP(s) rather than `file://`).
- TLE fetch fails: network access may be blocked; the app falls back to synthetic satellites.

---

## Extending the project (ideas & pointers)

- Replace the synthetic satellites with higher-fidelity groups or filter by NORAD categories.
- Add selectable satellite labels that render as sprites or HTML overlays.
- Improve the moon position and phase math, or add other planetary bodies.
- Move large shader code into `glsl` files and load them for clarity.
- Add unit tests around TLE parsing and fallback logic.

---

## Project structure (summary)

```
index.html       # app shell and UI
style.css        # page + control styling
script.js        # main app (rendering, UI logic, SGP4 integration)
sgp4-worker.js   # optional Web Worker for SGP4 propagation
README.md        # this file
```

---

## License & credits

- This project uses `three.js` and `satellite.js` (their licenses apply to their code).
- Textures and icons referenced are from public examples (three.js example assets) or generated at runtime as fallbacks.

If you want, I can:
- add a short `CONTRIBUTING.md` with coding conventions,
- extract shader code into dedicated files,
- or generate a `package.json` and basic dev scripts.

---

Thank you — tell me which area you want documented more deeply (e.g., the atmosphere math, SGP4 worker internals, or a developer guide for adding new UI controls) and I will expand that section.
