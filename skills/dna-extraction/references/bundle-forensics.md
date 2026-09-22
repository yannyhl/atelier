# Bundle forensics

Recipes for stages 3 to 9 of the method.
Examples come from the loanmeme.io study (webpack 5 bundle, three.js r145, 43,696 lines after prettier).
Run everything inside the scratch folder; nothing here is committed.

## Mirror

```sh
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
SITE=https://example.com
mkdir -p mirror && cd mirror
curl -sL -A "$UA" -o index.html "$SITE/"
grep -oE '(src|href)="[^"]+\.(js|css)[^"]*"' index.html      # find the bundles
curl -sL -A "$UA" -o script.js "$SITE/js/script.js"
curl -sL -A "$UA" -o style.css "$SITE/css/style.css"
curl -sL -A "$UA" -D - -o script.js.map "$SITE/js/script.js.map" | grep -i content-type
curl -sL -A "$UA" -o script.js.LICENSE.txt "$SITE/js/script.js.LICENSE.txt"
```

Always check the content type of optional files.
loanmeme.io answered `script.js.map` with its own `index.html` and status 200 (an SPA fallback); `measure-payload.mjs` flags this as `htmlFallback`.
A real source map is the best possible evidence: it restores file names and often original source.
Read it, never commit it.

Use `curl -A` with a browser user agent: some hosts serve different builds or block the default curl agent.
If the site loads chunks lazily, `observe.mjs` lists every URL the page actually requested; mirror those too.

## Beautify

```sh
npx --yes prettier@3 --parser babel script.js > script.pretty.js
npx --yes prettier@3 --parser css style.css > style.pretty.css
wc -l script.pretty.js
```

Prettier 3 handles multi-megabyte bundles in seconds.
Keep both files: grep the pretty one, quote line numbers from it.

## Libraries and versions

| Look for | Command | loanmeme finding |
|---|---|---|
| License banner | `head -c 300 script.js` | `/*! For license information please see script.js.LICENSE.txt */` |
| three.js revision | `grep -n '__THREE__\|REVISION' script.pretty.js` | `window.__THREE__ = "145"` |
| Embedded package.json | `grep -o 'name:"[^"]*",version:"[^"]*"' script.js` | `cannon` 0.6.2 |
| Shader tooling | `grep -c 'GLSLIFY' script.pretty.js` | 101 `#define GLSLIFY 1` lines: shaders built with glslify |
| Bundler | `head -c 120 script.js`, `grep -c webpackChunk script.js` | webpack 5 module map `(()=>{var t={125:...` and no `webpackChunk`: one chunk, no code splitting |
| Debug UI left in | `grep -o 'TpChangeEvent\|lil-gui\|dat.gui' script.js` | `TpChangeEvent`: Tweakpane bundled but hidden |
| Known helpers | library-specific strings (`Lethargy`, `SMAAEdgeDetection`, `GPUComputationRenderer`) | Lethargy wheel filter, SMAA |

The `LICENSE.txt` beside a webpack bundle lists every bundled package that had a license comment; it is the fastest dependency inventory.

## App code versus vendor code

1. Find the webpack module map (`var t={125:t=>{...}` in the minified file) and the entry near the end.
2. Vendor modules announce themselves: three.js has `WebGLRenderer`, `ShaderChunk`; physics engines ship their own `package.json`; minified libraries keep error strings.
3. App code is where asset paths, DOM ids and CSS class names appear.
   `grep -n '"\./assets/\|querySelector\|getElementById' script.pretty.js` lands you inside it.
4. Read outward from those anchors and name what you find in `notes.md` as you go.

## Assets, including built paths

```sh
grep -oE '"[^"]*\.(glb|gltf|ktx2|webp|png|jpe?g|mp4|json|woff2?)"' script.pretty.js | sort -u
grep -nE '"[^"]*" ?\+ ?[a-z]+ ?\+ ?"\.(glb|gltf|webp|png|jpe?g|ktx2)"' script.pretty.js
```

The second grep finds dynamically built paths.
On loanmeme it found `"./assets/scene/" + t + ".glb"` (called once per section name), `"./assets/fonts/" + t + ".webp"` (bitmap font atlases) and `"./assets/textures/baku/baku_" + r + ".webp"` (a loop over 0..5).
Open each call site to enumerate the values, then add every resolved URL to `urls.txt` for `measure-payload.mjs`.
Also list CSS `url(...)` references and the fonts requested by the page (`observe.mjs` prints the ones actually loaded).

## Minified classes to roles

Class names are minified; many member names are not.
Identify a class by:
- three.js API it calls (`new WebGLRenderTarget`, `onBeforeRender`, `AnimationMixer`) since those names survive;
- uniform names in its shaders (`uSceneTex`, `uSectionViewing`) since GLSL strings are never mangled;
- constructor arguments and the order they are created in the entry;
- behavior you can trigger live (a class that owns `deltaY` handling is the scroller).

Write the table as `evidence/class-map.md`: `| Minified | Source name | Role |`.
When a public source exists, fill "Source name" from it and cross-check at least three classes by matching shader text or constants.

## Shaders

```sh
grep -c 'gl_FragColor\|void main' script.pretty.js
grep -oE 'uniform [a-zA-Z0-9]+ u[A-Za-z0-9]+' script.pretty.js | sort | uniq -c | sort -rn | head -40
```

For each program record: what it draws, key uniforms, notable constants (blur weights, tap counts, thresholds) and any third-party snippet with its license comment (loanmeme carries MIT-licensed Jam3 fast-gaussian-blur and Ashima simplex noise).
Record parameters in the dossier; do not paste whole shaders.

## Scene files

`glb-info.mjs` reads only the 20-byte GLB header and the JSON chunk; on a URL it cancels the download after that, so a 2 MB character costs about 60 KB.
Things to note per file:

| Field | Tells you |
|---|---|
| `generator` | Authoring tool and exporter version (for example `Khronos glTF Blender I/O v5.0.21`). |
| `extensionsUsed` | Material features (`KHR_materials_sheen`), compression (`EXT_meshopt_compression`, `KHR_texture_basisu`) or its absence. |
| Node tree | Naming contract the code relies on: `CameraData > Camera, CameraTarget`, anchor empties, groups looked up by name. |
| Images | Format and bytes per texture; a big PNG inside a blocking file is a classic first-render cost. |
| Skins and animations | Joint count and clip names (`section_1`, `section_4_jump`) reveal the per-section animation plan. |

## Public source and provenance

- Grep `index.html` for commented-out markup: `grep -n '<!--' index.html`.
  loanmeme kept links to `twitter.com/junni_jp` and `junni.co.jp`, which led to the MIT repository `junni-inc/next.junni.co.jp`.
- Grep the bundle for names that do not match the brand (the mascot was still `Baku`) and for comments in other languages.
- Check award sites (Awwwards, FWA, CSSDA) for credits, then the credited developer's GitHub and articles.
- `gh search repos '<distinctive string>'` and `gh search code '"<distinctive shader line>"'` find forks and originals.
- If a licensed repository exists, clone it to scratch and prefer it: real names, comments, and often the authoring files (JUNNI published every `.blend`).
