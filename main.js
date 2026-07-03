// ─── REAL-TIME WEBCAM FILTERS ────────────────────────────────────────────────────
// 12 cinematic GLSL filters via Three.js + WebGL

(function () {
    'use strict';

    const canvas = document.getElementById('canvas');

    // ─── WEBCAM ──────────────────────────────────────────────────────────────────
    const video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    let videoTexture = null;

    navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } }
    }).then(stream => {
        video.srcObject = stream;
        video.play();
        videoTexture = new THREE.VideoTexture(video);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.format = THREE.RGBAFormat;
        videoTexture.wrapS = THREE.ClampToEdgeWrapping;
        videoTexture.wrapT = THREE.ClampToEdgeWrapping;
    }).catch(err => console.error('Camera error:', err));

    // ─── UNIFORMS ────────────────────────────────────────────────────────────────
    const uniforms = {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        u_texture: { value: null }
    };

    // ─── VERTEX SHADER (shared) ───────────────────────────────────────────────────
    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    // ═══════════════════════════════════════════════════════════════════════════════
    // FRAGMENT SHADERS
    // ═══════════════════════════════════════════════════════════════════════════════

    // ─── 1. ANIME ────────────────────────────────────────────────────────────────
    const animeFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 texel = 1.0 / u_resolution;

            // Cell-shading posterization
            float levels = 5.0;
            vec4 col = texture2D(u_texture, uv);
            col.rgb = floor(col.rgb * levels + 0.5) / levels;

            // Saturation + contrast boost
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(vec3(gray), col.rgb, 1.5);
            col.rgb = (col.rgb - 0.5) * 1.2 + 0.5;

            // Sobel edge detection for thick outlines
            float l[9];
            for (int i = 0; i < 3; i++) {
                for (int j = 0; j < 3; j++) {
                    vec2 off = vec2(float(i - 1), float(j - 1)) * texel * 1.5;
                    l[i * 3 + j] = dot(texture2D(u_texture, uv + off).rgb, vec3(0.299, 0.587, 0.114));
                }
            }
            float gx = l[2] + 2.0*l[5] + l[8] - l[0] - 2.0*l[3] - l[6];
            float gy = l[0] + 2.0*l[1] + l[2] - l[6] - 2.0*l[7] - l[8];
            float edge = sqrt(gx*gx + gy*gy);
            float outline = 1.0 - smoothstep(0.04, 0.18, edge);

            // Mix outline (dark lines on posterized color)
            col.rgb = mix(col.rgb, vec3(0.02), outline * 0.85);

            // Warm vignette
            vec2 c = uv - 0.5;
            col.rgb *= 1.0 - dot(c, c) * 0.6;

            gl_FragColor = col;
        }
    `;

    // ─── 2. CYBERPUNK ────────────────────────────────────────────────────────────
    const cyberpunkFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
            vec2 uv = vUv;

            // Glitch: random horizontal shift on some scan rows
            float glitchLine = step(0.96, hash(vec2(floor(uv.y * 80.0), floor(u_time * 12.0))));
            uv.x += glitchLine * 0.04 * (hash(vec2(u_time, uv.y)) - 0.5);

            // Chromatic aberration
            float ca = 0.006;
            float r = texture2D(u_texture, uv + vec2(ca, 0.0)).r;
            float g = texture2D(u_texture, uv).g;
            float b = texture2D(u_texture, uv - vec2(ca, 0.0)).b;
            vec4 col = vec4(r, g, b, 1.0);

            // Neon pink/cyan color grade
            float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(vec3(lum), col.rgb, 0.7);
            float bright = max(col.r, max(col.g, col.b));
            col.rgb += vec3(0.95, 0.05, 0.75) * pow(bright, 2.2) * 0.5;
            col.rgb += vec3(0.0, 0.95, 0.95) * pow(bright, 3.0) * 0.35;

            // Scanlines
            col.rgb *= 0.85 + 0.15 * sin(uv.y * u_resolution.y * 1.5);

            // Film grain
            col.rgb += (hash(uv * u_resolution + u_time * 100.0) - 0.5) * 0.07;

            // CRT vignette + flicker
            vec2 c = uv - 0.5;
            col.rgb *= (1.0 - dot(c, c) * 0.8) * (0.97 + 0.03 * sin(u_time * 0.7));

            gl_FragColor = col;
        }
    `;

    // ─── 3. NEON GLOW ────────────────────────────────────────────────────────────
    const neonFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 texel = 1.0 / u_resolution;
            vec4 col = texture2D(u_texture, uv);

            // High contrast + saturation
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(vec3(gray), col.rgb, 1.7);
            col.rgb = (col.rgb - 0.5) * 1.4 + 0.5;

            // Neon pulsating tint
            float p1 = sin(u_time * 1.5) * 0.5 + 0.5;
            float p2 = sin(u_time * 2.1 + 2.0) * 0.5 + 0.5;
            vec3 tint = mix(vec3(0.95, 0.05, 0.85), vec3(0.0, 0.9, 0.95), p1);
            col.rgb = mix(col.rgb, col.rgb * tint, 0.3 + 0.1 * p2);

            // 25-sample bloom
            float bloom = 0.0;
            for (int i = -2; i <= 2; i++) {
                for (int j = -2; j <= 2; j++) {
                    vec2 off = vec2(float(i), float(j)) * texel * 3.5;
                    float b = max(texture2D(u_texture, uv + off).r,
                                  max(texture2D(u_texture, uv + off).g,
                                      texture2D(u_texture, uv + off).b));
                    bloom += b;
                }
            }
            bloom /= 25.0;
            bloom = pow(bloom, 3.5) * 0.9;
            col.rgb += vec3(0.85, 0.15, 0.95) * bloom;

            // Color fringing
            float ca = 0.003 + 0.002 * sin(u_time * 0.6);
            col.r = mix(col.r, texture2D(u_texture, uv + vec2(ca, 0.0)).r, 0.4);
            col.b = mix(col.b, texture2D(u_texture, uv - vec2(ca, 0.0)).b, 0.4);

            // Vignette
            vec2 c = uv - 0.5;
            col.rgb *= 1.0 - dot(c, c) * 0.45;

            gl_FragColor = col;
        }
    `;

    // ─── 4. VHS RETRO ───────────────────────────────────────────────────────────
    const vhsFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
            vec2 uv = vUv;

            // Slight vertical wobble
            uv.x += sin(uv.y * 40.0 + u_time * 3.0) * 0.002;

            // Tracking distortion band
            float band = smoothstep(0.48, 0.5, fract(uv.y - u_time * 0.1));
            band *= smoothstep(0.52, 0.5, fract(uv.y - u_time * 0.1));
            uv.x += band * 0.08;

            // Heavy chromatic aberration
            float r = texture2D(u_texture, uv + vec2(0.004, 0.002)).r;
            float g = texture2D(u_texture, uv).g;
            float b = texture2D(u_texture, uv - vec2(0.004, 0.002)).b;
            vec4 col = vec4(r, g, b, 1.0);

            // VHS desaturation + yellow tint
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(vec3(gray), col.rgb, 0.65);
            col.rgb *= vec3(1.05, 1.0, 0.85);

            // Horizontal smear lines
            col.rgb *= 0.92 + 0.08 * sin(uv.y * u_resolution.y * 0.8 + u_time * 4.0);

            // Noise
            col.rgb += (hash(uv * u_resolution + u_time * 60.0) - 0.5) * 0.1;

            // Bottom blue line (VHS artifact)
            if (uv.y > 0.97) col.rgb = vec3(0.1, 0.1, 0.6);

            // Vignette
            vec2 c = uv - 0.5;
            col.rgb *= 1.0 - dot(c, c) * 0.7;

            gl_FragColor = col;
        }
    `;

    // ─── 5. FILM NOIR ───────────────────────────────────────────────────────────
    const noirFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec4 col = texture2D(u_texture, uv);

            // Convert to high-contrast B&W
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));

            // Regulate: push midtones darker for noir feel
            gray = pow(gray, 1.3);

            // Aggressive contrast: crush blacks, bloom whites
            gray = clamp((gray - 0.35) * 2.2 + 0.35, 0.0, 1.0);

            // Slight warm tint in highlights
            vec3 noir = vec3(gray);
            float hi = smoothstep(0.6, 1.0, gray);
            noir += vec3(0.06, 0.03, 0.0) * hi;

            // Heavy vignette
            vec2 c = uv - 0.5;
            float vig = 1.0 - dot(c, c) * 1.2;
            vig = clamp(vig, 0.0, 1.0);
            noir *= vig;

            // Film grain
            float grain = fract(sin(dot(uv * u_resolution + u_time * 40.0, vec2(12.9898, 78.233))) * 43758.5453);
            noir += (grain - 0.5) * 0.06;

            gl_FragColor = vec4(noir, 1.0);
        }
    `;

    // ─── 6. WATERCOLOR ──────────────────────────────────────────────────────────
    const watercolorFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 texel = 1.0 / u_resolution;

            // Multi-sample blur for painterly softness
            vec4 col = vec4(0.0);
            float total = 0.0;
            for (int i = -3; i <= 3; i++) {
                for (int j = -3; j <= 3; j++) {
                    float w = 1.0 / (1.0 + float(abs(i) + abs(j)));
                    vec2 off = vec2(float(i), float(j)) * texel * 1.5;
                    col += texture2D(u_texture, uv + off) * w;
                    total += w;
                }
            }
            col /= total;

            // Reduce color palette (quantize)
            float levels = 8.0;
            col.rgb = floor(col.rgb * levels + 0.3) / levels;

            // Boost saturation for paint vibrancy
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(vec3(gray), col.rgb, 1.6);

            // Edge darkening (paint meets paper)
            float l[9];
            for (int i = 0; i < 3; i++) {
                for (int j = 0; j < 3; j++) {
                    vec2 off = vec2(float(i-1), float(j-1)) * texel * 2.0;
                    l[i*3+j] = dot(texture2D(u_texture, uv + off).rgb, vec3(0.299, 0.587, 0.114));
                }
            }
            float gx = l[2]+2.0*l[5]+l[8] - l[0]-2.0*l[3]-l[6];
            float gy = l[0]+2.0*l[1]+l[2] - l[6]-2.0*l[7]-l[8];
            float edge = sqrt(gx*gx + gy*gy);
            col.rgb *= 1.0 - smoothstep(0.02, 0.15, edge) * 0.25;

            // Paper texture
            col.rgb *= 0.95 + 0.05 * fract(sin(dot(uv * 300.0, vec2(12.9898, 78.233))) * 43758.5453);

            gl_FragColor = col;
        }
    `;

    // ─── 7. PIXEL ART ───────────────────────────────────────────────────────────
    const pixelFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;

            // Pixelate
            float pixelSize = 5.0;
            vec2 pixelated = floor(uv * u_resolution / pixelSize) * pixelSize / u_resolution;
            vec4 col = texture2D(u_texture, pixelated);

            // Quantize colors for retro palette
            col.rgb = floor(col.rgb * 6.0 + 0.5) / 6.0;

            // Boost saturation
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(vec3(gray), col.rgb, 1.8);

            // Subtle grid lines
            vec2 grid = fract(uv * u_resolution / pixelSize);
            float line = step(0.06, grid.x) * step(0.06, grid.y);
            col.rgb *= 0.85 + 0.15 * line;

            gl_FragColor = col;
        }
    `;

    // ─── 8. GLITCH / DIGITAL ────────────────────────────────────────────────────
    const glitchFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
            vec2 uv = vUv;

            // Big block glitch
            float blockY = floor(uv.y * 12.0);
            float blockShift = step(0.92, hash(vec2(blockY, floor(u_time * 8.0)))) * 0.15;
            blockShift *= (hash(vec2(blockY + 0.5, u_time)) - 0.5);
            uv.x += blockShift;

            // RGB split
            float r = texture2D(u_texture, uv + vec2(0.01, 0.0)).r;
            float g = texture2D(u_texture, uv).g;
            float b = texture2D(u_texture, uv - vec2(0.01, 0.0)).b;
            vec4 col = vec4(r, g, b, 1.0);

            // Random inversion blocks
            float invBlock = step(0.96, hash(vec2(floor(uv.x * 20.0), floor(u_time * 15.0))));
            col.rgb = mix(col.rgb, 1.0 - col.rgb, invBlock * 0.7);

            // Scanlines
            col.rgb *= 0.9 + 0.1 * sin(uv.y * u_resolution.y * 2.0);

            // Static noise burst
            float noise = hash(uv * u_resolution + u_time * 80.0);
            float burst = step(0.985, hash(vec2(floor(u_time * 20.0))));
            col.rgb = mix(col.rgb, vec3(noise), burst * 0.6);

            gl_FragColor = col;
        }
    `;

    // ─── 9. THERMAL / HEAT VISION ───────────────────────────────────────────────
    const thermalFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        vec3 thermalPalette(float t) {
            // Black → Blue → Cyan → Green → Yellow → Red → White
            vec3 c;
            if (t < 0.15)      c = mix(vec3(0.0, 0.0, 0.1),  vec3(0.0, 0.0, 0.8),  t / 0.15);
            else if (t < 0.35) c = mix(vec3(0.0, 0.0, 0.8),  vec3(0.0, 0.8, 0.9),  (t - 0.15) / 0.2);
            else if (t < 0.55) c = mix(vec3(0.0, 0.8, 0.9),  vec3(0.0, 0.9, 0.1),  (t - 0.35) / 0.2);
            else if (t < 0.75) c = mix(vec3(0.0, 0.9, 0.1),  vec3(1.0, 1.0, 0.0),  (t - 0.55) / 0.2);
            else if (t < 0.9)  c = mix(vec3(1.0, 1.0, 0.0),  vec3(1.0, 0.2, 0.0),  (t - 0.75) / 0.15);
            else               c = mix(vec3(1.0, 0.2, 0.0),  vec3(1.0, 1.0, 1.0),  (t - 0.9) / 0.1);
            return c;
        }

        void main() {
            vec2 uv = vUv;
            vec4 col = texture2D(u_texture, uv);

            // Map luminance to heat (bias towards warmth)
            float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            lum = pow(lum, 0.8); // bias bright
            lum += 0.05 * sin(u_time * 2.0 + uv.x * 10.0); // thermal shimmer

            vec3 heat = thermalPalette(clamp(lum, 0.0, 1.0));

            // Slight blur for thermal camera softness
            vec2 texel = 1.0 / u_resolution;
            vec4 blur = vec4(0.0);
            for (int i = -1; i <= 1; i++) {
                for (int j = -1; j <= 1; j++) {
                    vec2 off = vec2(float(i), float(j)) * texel * 2.0;
                    float l2 = dot(texture2D(u_texture, uv + off).rgb, vec3(0.299, 0.587, 0.114));
                    blur += vec4(thermalPalette(clamp(pow(l2, 0.8), 0.0, 1.0)), 1.0);
                }
            }
            heat = mix(heat, blur.rgb / 9.0, 0.3);

            // Crosshair overlay
            vec2 center = uv - 0.5;
            float cross = step(0.001, abs(center.x)) * step(0.001, abs(center.y));
            float ch = smoothstep(0.002, 0.0, abs(center.x)) + smoothstep(0.002, 0.0, abs(center.y));
            ch = min(ch, 1.0);
            heat = mix(heat, vec3(0.0), ch * 0.5);

            gl_FragColor = vec4(heat, 1.0);
        }
    `;

    // ─── 10. POP ART ────────────────────────────────────────────────────────────
    const popArtFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec4 col = texture2D(u_texture, uv);

            // Heavy posterization
            float levels = 4.0;
            col.rgb = floor(col.rgb * levels + 0.5) / levels;

            // Replace with bold pop-art palette (Warhol style)
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            vec3 pop;
            if (gray < 0.25)      pop = vec3(0.05, 0.05, 0.4);   // deep blue
            else if (gray < 0.45) pop = vec3(1.0, 0.1, 0.3);     // hot pink
            else if (gray < 0.65) pop = vec3(1.0, 0.8, 0.0);     // bright yellow
            else if (gray < 0.8)  pop = vec3(0.0, 0.8, 0.3);     // vivid green
            else                   pop = vec3(1.0, 1.0, 0.9);     // near white

            // Re-tint with original hue hints
            vec3 origHue = normalize(col.rgb + 0.001);
            pop = mix(pop, pop * origHue * 2.0, 0.15);

            // Halftone dot pattern
            vec2 dotUV = fract(uv * u_resolution / 6.0) - 0.5;
            float dotSize = length(dotUV);
            float dotMask = smoothstep(0.3, 0.35, dotSize);
            pop *= 0.7 + 0.3 * dotMask;

            gl_FragColor = vec4(pop, 1.0);
        }
    `;

    // ─── 11. DREAMY / SOFT FOCUS ────────────────────────────────────────────────
    const dreamyFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 texel = 1.0 / u_resolution;

            // Multi-layer soft blur (wide kernel)
            vec4 blur = vec4(0.0);
            float total = 0.0;
            for (int i = -4; i <= 4; i++) {
                for (int j = -4; j <= 4; j++) {
                    float w = 1.0 / (1.0 + float(abs(i) + abs(j)));
                    vec2 off = vec2(float(i), float(j)) * texel * 2.5;
                    blur += texture2D(u_texture, uv + off) * w;
                    total += w;
                }
            }
            blur /= total;

            // Mix original with blurred (soft focus blend)
            vec4 orig = texture2D(u_texture, uv);
            vec4 col = mix(orig, blur, 0.55);

            // Warm golden tint
            col.rgb *= vec3(1.08, 1.04, 0.92);

            // Soft saturation boost
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(vec3(gray), col.rgb, 1.3);

            // Dreamy glow on highlights
            float bright = max(orig.r, max(orig.g, orig.b));
            float glow = pow(bright, 3.0) * 0.35;
            col.rgb += vec3(1.0, 0.9, 0.7) * glow;

            // Gentle vignette
            vec2 c = uv - 0.5;
            col.rgb *= 1.0 - dot(c, c) * 0.5;

            // Breathing brightness
            col.rgb *= 0.98 + 0.02 * sin(u_time * 0.8);

            gl_FragColor = col;
        }
    `;

    // ─── 12. COMIC BOOK ─────────────────────────────────────────────────────────
    const comicFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            vec2 texel = 1.0 / u_resolution;

            // Strong posterization for flat color fills
            vec4 col = texture2D(u_texture, uv);
            float levels = 4.0;
            col.rgb = floor(col.rgb * levels + 0.5) / levels;

            // Bold saturation
            float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            col.rgb = mix(vec3(gray), col.rgb, 2.0);

            // Heavy black outlines (Sobel)
            float l[9];
            for (int i = 0; i < 3; i++) {
                for (int j = 0; j < 3; j++) {
                    vec2 off = vec2(float(i-1), float(j-1)) * texel * 2.0;
                    l[i*3+j] = dot(texture2D(u_texture, uv + off).rgb, vec3(0.299, 0.587, 0.114));
                }
            }
            float gx = l[2]+2.0*l[5]+l[8] - l[0]-2.0*l[3]-l[6];
            float gy = l[0]+2.0*l[1]+l[2] - l[6]-2.0*l[7]-l[8];
            float edge = sqrt(gx*gx + gy*gy);

            // Ben-Day dots
            vec2 dotGrid = fract(uv * u_resolution / 8.0) - 0.5;
            float dotSize = length(dotGrid);
            float shadow = smoothstep(0.35, 0.5, gray);
            float dotMask = smoothstep(0.25 + shadow * 0.15, 0.3 + shadow * 0.15, dotSize);

            // Apply dots to shadow areas
            col.rgb *= 0.7 + 0.3 * dotMask;

            // Overlay outlines
            float outline = 1.0 - smoothstep(0.06, 0.2, edge);
            col.rgb = mix(col.rgb, vec3(0.0), outline * 0.9);

            gl_FragColor = col;
        }
    `;

    // ═══════════════════════════════════════════════════════════════════════════════
    // THREE.JS SCENE SETUP
    // ═══════════════════════════════════════════════════════════════════════════════

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const shaders = {
        anime:     animeFrag,
        cyberpunk: cyberpunkFrag,
        neon:      neonFrag,
        vhs:       vhsFrag,
        noir:      noirFrag,
        watercolor:watercolorFrag,
        pixel:     pixelFrag,
        glitch:    glitchFrag,
        thermal:   thermalFrag,
        popart:    popArtFrag,
        dreamy:    dreamyFrag,
        comic:     comicFrag
    };

    let currentFilter = 'anime';
    let material = null;
    let mesh = null;

    // Passthrough shader for "none" filter (raw webcam)
    const passthroughFrag = `
        precision highp float;
        uniform sampler2D u_texture;
        varying vec2 vUv;
        void main() {
            gl_FragColor = texture2D(u_texture, vUv);
        }
    `;

    function applyFilter(name) {
        if (name === 'none') {
            currentFilter = name;
            document.querySelectorAll('#controls button').forEach(b => {
                b.classList.toggle('active', b.dataset.filter === name);
            });
            if (material) material.dispose();
            material = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: vertexShader,
                fragmentShader: passthroughFrag,
                transparent: false,
                depthTest: false
            });
            if (mesh) scene.remove(mesh);
            mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);
            return;
        }
        if (!shaders[name]) return;
        currentFilter = name;

        // Update UI
        document.querySelectorAll('#controls button').forEach(b => {
            b.classList.toggle('active', b.dataset.filter === name);
        });

        // Dispose old material
        if (material) material.dispose();

        // Create new shader material
        material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertexShader,
            fragmentShader: shaders[name],
            transparent: false,
            depthTest: false
        });

        // Replace mesh
        if (mesh) scene.remove(mesh);
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
    }

    // ─── RESIZE ──────────────────────────────────────────────────────────────────
    function onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;
        renderer.setSize(w, h);
        uniforms.u_resolution.value.set(w, h);
    }
    window.addEventListener('resize', onResize);
    onResize();

    // ─── RENDER LOOP ─────────────────────────────────────────────────────────────
    let startTime = performance.now();

    function animate() {
        requestAnimationFrame(animate);

        uniforms.u_time.value = (performance.now() - startTime) * 0.001;

        // Update video texture
        if (videoTexture && video.readyState >= video.HAVE_ENOUGH_DATA) {
            videoTexture.needsUpdate = true;
            uniforms.u_texture.value = videoTexture;
        }

        renderer.render(scene, camera);
    }

    // ─── INIT ────────────────────────────────────────────────────────────────────
    applyFilter('anime');
    animate();

    // ─── UI EVENT BINDING ────────────────────────────────────────────────────────
    document.querySelectorAll('#controls button').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterName = btn.dataset.filter;
            if (filterName) applyFilter(filterName);
        });
    });

})();
