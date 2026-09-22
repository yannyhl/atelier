# Third-party notices

atelier adapts techniques and code patterns from the following MIT-licensed projects.
No third-party assets are redistributed.

## next.junni.co.jp

Source: https://github.com/junni-inc/next.junni.co.jp
Used for: section scroller physics, animator-as-uniform pattern, post chain design, bloom composite, section model.
Adapted into skill assets (with attribution in each file): the CRT display shader (`skills/glass-refraction/assets/crt-display.glsl`), the crowd velocity and position kernels (`skills/gpgpu-effects/assets/crowd/`), and the PCF sample disk of the studio shadow (`skills/character-studio-shading/assets/studio-shadow.glsl`).

```
Copyright 2022 Junni Co., ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## ore-three

Source: https://github.com/ukonpower/ore-three
Used for: easing set including sigmoid, animator design, layer lifecycle.

```
MIT License

Copyright (c) 2022 ukonpower

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Other

- Simplex noise in `packages/stage/src/effects/glsl/common.glsl`: Ashima Arts and Stefan Gustavson, MIT.
- 13-tap downsample and tent upsample: after Jorge Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare" (SIGGRAPH 2014).
- three.js (MIT) and its examples (SMAAPass, FXAAPass, GLTFLoader, KTX2Loader, meshopt decoder).
