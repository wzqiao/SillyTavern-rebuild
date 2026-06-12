<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';

/**
 * Igloo-inspired WebGL atmosphere:
 * - fullscreen FBM "frost aurora" shader with pointer parallax and edge
 *   chromatic aberration
 * - additive particle field that drifts, follows the pointer in parallax, and
 *   coalesces around UI beacons (dispatched as `reforged-beacon` events)
 * Everything renders in clip space, so no projection camera is needed.
 */

interface BeaconDetail {
    x: number;
    y: number;
    active: boolean;
}

const canvasRef = ref<HTMLCanvasElement | null>(null);

let dispose: (() => void) | null = null;

const BACKGROUND_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BACKGROUND_FRAGMENT = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uAspect;
uniform vec2 uPointer;

float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int index = 0; index < 4; index += 1) {
        value += amplitude * noise(p);
        p = p * 2.03 + vec2(17.7, -9.2);
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 centered = (vUv - 0.5) * vec2(uAspect, 1.0);
    vec2 drift = uPointer * 0.07;
    float t = uTime * 0.035;

    vec3 color = mix(vec3(0.024, 0.035, 0.047), vec3(0.051, 0.082, 0.114), smoothstep(1.15, -0.35, vUv.y) * 0.85);

    vec2 auroraField = vec2(centered.x * 1.35 + t * 2.1, centered.y * 3.1 - t * 0.9) + drift;
    float aberration = 0.045 * dot(centered, centered);
    float bandG = fbm(auroraField);
    float bandR = fbm(auroraField + vec2(aberration, 0.0));
    float bandB = fbm(auroraField - vec2(aberration, 0.0));
    float ribbon = fbm(vec2(centered.x * 2.3 - t * 1.5, centered.y * 4.2 + t * 0.6) - drift);

    float heightFade = smoothstep(-0.65, 0.45, centered.y + fbm(centered * 2.0) * 0.35);
    vec3 mint = vec3(0.561, 0.890, 0.816);
    vec3 ice = vec3(0.788, 0.839, 0.898);
    vec3 aurora = vec3(
        mint.r * smoothstep(0.46, 0.88, bandR),
        mint.g * smoothstep(0.46, 0.88, bandG),
        mint.b * smoothstep(0.46, 0.88, bandB)
    );
    color += aurora * 0.17 * (0.45 + heightFade);
    color += ice * smoothstep(0.52, 0.92, ribbon) * 0.06 * heightFade;

    float hearth = exp(-length(centered - vec2(uAspect * -0.38, -0.44)) * 2.1);
    color += vec3(0.847, 0.643, 0.373) * hearth * 0.075;

    float vignette = smoothstep(1.35, 0.3, length(centered - uPointer * 0.05));
    color *= mix(0.78, 1.0, vignette);

    float grain = hash(vUv * vec2(1287.0, 711.0) + fract(uTime) * 37.1) - 0.5;
    color += grain * 0.014;

    gl_FragColor = vec4(color, 1.0);
}
`;

const PARTICLE_VERTEX = /* glsl */ `
attribute vec3 aSeed;
attribute float aSize;

uniform float uTime;
uniform float uAspect;
uniform float uPixelRatio;
uniform float uBeaconStrength;
uniform vec2 uPointer;
uniform vec2 uBeacon;

varying float vGlow;
varying float vTint;

void main() {
    float rand = aSeed.z;
    float t = uTime * (0.14 + rand * 0.26);
    float phase = rand * 6.28318;

    vec2 point = aSeed.xy;
    point.x += sin(t + phase) * 0.05 * (0.35 + rand);
    point.y += cos(t * 0.83 + phase * 1.7) * 0.065 * (0.35 + rand);
    point += uPointer * (0.012 + rand * 0.05);

    vec2 toBeacon = (uBeacon - point) * vec2(uAspect, 1.0);
    float beaconDistance = length(toBeacon);
    float pull = uBeaconStrength * exp(-beaconDistance * 3.4);
    vec2 direction = toBeacon / max(beaconDistance, 0.0001);
    vec2 tangent = vec2(-direction.y, direction.x);
    vec2 swirl = (direction * 0.85 + tangent * sin(t * 3.1 + phase)) * pull * 0.4;
    point += swirl / vec2(uAspect, 1.0);

    vGlow = pull;
    vTint = rand;
    gl_Position = vec4(point, 0.0, 1.0);
    gl_PointSize = aSize * uPixelRatio * (1.0 + pull * 2.4);
}
`;

const PARTICLE_FRAGMENT = /* glsl */ `
precision highp float;

varying float vGlow;
varying float vTint;

void main() {
    float distanceToCenter = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.04, distanceToCenter);
    vec3 frost = mix(vec3(0.788, 0.839, 0.898), vec3(0.561, 0.890, 0.816), step(0.55, vTint));
    vec3 color = mix(frost, vec3(0.847, 0.643, 0.373), step(0.93, vTint));
    color = mix(color, vec3(0.93, 1.0, 0.97), clamp(vGlow, 0.0, 1.0));
    float alpha = core * (0.3 + 0.42 * vTint) * (0.5 + vGlow * 1.4);
    gl_FragColor = vec4(color, alpha);
}
`;

onMounted(() => {
    const canvas = canvasRef.value;

    if (!canvas) {
        return;
    }

    let renderer: THREE.WebGLRenderer;

    try {
        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: false,
            powerPreference: 'high-performance',
        });
    } catch {
        return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();

    const sharedUniforms = {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uBeacon: { value: new THREE.Vector2(0, 0) },
        uBeaconStrength: { value: 0 },
        uPixelRatio: { value: 1 },
    };

    const backgroundGeometry = new THREE.BufferGeometry();
    backgroundGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    const backgroundMaterial = new THREE.ShaderMaterial({
        vertexShader: BACKGROUND_VERTEX,
        fragmentShader: BACKGROUND_FRAGMENT,
        uniforms: sharedUniforms,
        depthTest: false,
        depthWrite: false,
    });
    const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
    background.frustumCulled = false;
    background.renderOrder = 0;
    scene.add(background);

    const particleCount = coarsePointer.matches ? 900 : 2200;
    const seeds = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const positions = new Float32Array(particleCount * 3);
    const random = seededRandom(1337);

    for (let index = 0; index < particleCount; index += 1) {
        seeds[index * 3] = random() * 2.3 - 1.15;
        seeds[index * 3 + 1] = random() * 2.3 - 1.15;
        seeds[index * 3 + 2] = random();
        sizes[index] = 1 + random() * 2.4;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const particleMaterial = new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VERTEX,
        fragmentShader: PARTICLE_FRAGMENT,
        uniforms: sharedUniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.frustumCulled = false;
    particles.renderOrder = 1;
    scene.add(particles);

    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const beacon = { x: 0, y: 0, targetX: 0, targetY: 0, strength: 0, targetStrength: 0 };
    let frameId = 0;
    let running = false;
    let elapsed = reducedMotion.matches ? 24 : 0;
    let lastTimestamp: number | null = null;

    function resize(): void {
        const width = Math.max(window.innerWidth, 1);
        const height = Math.max(window.innerHeight, 1);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
        sharedUniforms.uAspect.value = width / height;
        sharedUniforms.uPixelRatio.value = pixelRatio;

        if (reducedMotion.matches) {
            renderFrame();
        }
    }

    function toNdcX(clientX: number): number {
        return (clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
    }

    function toNdcY(clientY: number): number {
        return -((clientY / Math.max(window.innerHeight, 1)) * 2 - 1);
    }

    function handlePointerMove(event: PointerEvent): void {
        pointer.targetX = toNdcX(event.clientX);
        pointer.targetY = toNdcY(event.clientY);
    }

    function handleBeacon(event: Event): void {
        const detail = (event as CustomEvent<BeaconDetail>).detail;

        if (!detail) {
            return;
        }

        if (detail.active) {
            beacon.targetX = toNdcX(detail.x);
            beacon.targetY = toNdcY(detail.y);
            beacon.targetStrength = 1;
        } else {
            beacon.targetStrength = 0;
        }
    }

    function renderFrame(): void {
        sharedUniforms.uTime.value = elapsed;
        sharedUniforms.uPointer.value.set(pointer.x, pointer.y);
        sharedUniforms.uBeacon.value.set(beacon.x, beacon.y);
        sharedUniforms.uBeaconStrength.value = beacon.strength;
        renderer.render(scene, camera);
    }

    function tick(timestamp: number): void {
        if (!running) {
            return;
        }

        if (lastTimestamp !== null) {
            elapsed += Math.min((timestamp - lastTimestamp) / 1000, 0.05);
        }
        lastTimestamp = timestamp;

        pointer.x += (pointer.targetX - pointer.x) * 0.04;
        pointer.y += (pointer.targetY - pointer.y) * 0.04;
        beacon.x += (beacon.targetX - beacon.x) * 0.1;
        beacon.y += (beacon.targetY - beacon.y) * 0.1;
        beacon.strength += (beacon.targetStrength - beacon.strength) * 0.08;

        renderFrame();
        frameId = window.requestAnimationFrame(tick);
    }

    function start(): void {
        if (running || reducedMotion.matches) {
            return;
        }

        running = true;
        lastTimestamp = null;
        frameId = window.requestAnimationFrame(tick);
    }

    function stop(): void {
        running = false;
        window.cancelAnimationFrame(frameId);
    }

    function handleVisibility(): void {
        if (document.hidden) {
            stop();
        } else {
            start();
        }
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('reforged-beacon', handleBeacon);
    document.addEventListener('visibilitychange', handleVisibility);

    if (reducedMotion.matches) {
        renderFrame();
    } else {
        start();
    }

    dispose = () => {
        stop();
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('reforged-beacon', handleBeacon);
        document.removeEventListener('visibilitychange', handleVisibility);
        backgroundGeometry.dispose();
        backgroundMaterial.dispose();
        particleGeometry.dispose();
        particleMaterial.dispose();
        renderer.dispose();
    };
});

onBeforeUnmount(() => {
    dispose?.();
    dispose = null;
});

function seededRandom(seed: number): () => number {
    let value = seed;

    return () => {
        value |= 0;
        value = (value + 0x6D2B79F5) | 0;
        let result = Math.imul(value ^ (value >>> 15), 1 | value);
        result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}
</script>

<template>
    <canvas
        ref="canvasRef"
        class="atmosphere-canvas"
        aria-hidden="true"
    />
</template>

<style scoped>
.atmosphere-canvas {
    position: fixed;
    inset: 0;
    z-index: -3;
    width: 100vw;
    height: 100dvh;
    pointer-events: none;
}
</style>
