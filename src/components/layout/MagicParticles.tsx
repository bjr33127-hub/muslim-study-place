import { useEffect, useRef } from 'react'

type MagicParticlesProps = {
  active: boolean
  sceneKey: string
}

const VERTEX_SHADER = `
attribute float aSeed;
attribute float aSize;
attribute float aSpeed;
varying float vSeed;
varying float vPulse;
uniform float uTime;

void main() {
  float drift = sin(uTime * 0.12 + aSeed * 18.0) * 0.035;
  float sway = sin(uTime * 0.045 + aSeed * 31.0) * 0.02;
  float y = mod(position.y + 1.25 + uTime * aSpeed, 2.5) - 1.25;
  vec3 p = vec3(position.x + drift + sway, y, position.z);
  vSeed = aSeed;
  vPulse = 0.58 + 0.42 * sin(uTime * (0.8 + aSpeed * 24.0) + aSeed * 24.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  gl_PointSize = aSize * (0.74 + vPulse * 0.34);
}
`

const FRAGMENT_SHADER = `
precision mediump float;
varying float vSeed;
varying float vPulse;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);
  float glow = smoothstep(0.5, 0.0, dist);
  float core = smoothstep(0.14, 0.0, dist);
  float cross = max(
    smoothstep(0.035, 0.0, abs(uv.x)) * smoothstep(0.44, 0.0, abs(uv.y)),
    smoothstep(0.035, 0.0, abs(uv.y)) * smoothstep(0.44, 0.0, abs(uv.x))
  );
  vec3 warmGold = vec3(1.0, 0.78, 0.34);
  vec3 softGreen = vec3(0.55, 0.95, 0.62);
  vec3 moonBlue = vec3(0.68, 0.82, 1.0);
  vec3 color = mix(warmGold, softGreen, smoothstep(0.32, 0.82, fract(vSeed * 7.1)));
  color = mix(color, moonBlue, 0.18 * smoothstep(0.74, 1.0, fract(vSeed * 3.7)));
  float alpha = (glow * 0.62 + core * 0.96 + cross * 0.42) * (0.72 + vPulse * 0.42);

  if (alpha < 0.012) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`

function particleCount(width: number) {
  if (width < 520) {
    return 150
  }

  if (width < 900) {
    return 220
  }

  return 320
}

function fillParticleAttributes(
  positions: Float32Array,
  seeds: Float32Array,
  sizes: Float32Array,
  speeds: Float32Array,
) {
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = Math.random()
    positions[index * 3] = Math.random() * 2.35 - 1.175
    positions[index * 3 + 1] = Math.random() * 2.5 - 1.25
    positions[index * 3 + 2] = 0
    seeds[index] = seed
    sizes[index] = 6 + Math.random() * 18
    speeds[index] = 0.012 + Math.random() * 0.035
  }
}

export function MagicParticles({ active, sceneKey }: MagicParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (!canvas || !active || reducedMotion.matches) {
      return
    }

    canvas.removeAttribute('data-particles-ready')

    let cleanupScene = () => undefined
    let cancelled = false

    void import('three').then((THREE) => {
      if (cancelled) {
        return
      }

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas,
        powerPreference: 'low-power',
        preserveDrawingBuffer: true,
      })
      const scene = new THREE.Scene()
      const camera = new THREE.Camera()
      const geometry = new THREE.BufferGeometry()
      const count = particleCount(window.innerWidth)
      const positions = new Float32Array(count * 3)
      const seeds = new Float32Array(count)
      const sizes = new Float32Array(count)
      const speeds = new Float32Array(count)
      const uniforms = {
        uTime: { value: 0 },
      }
      const material = new THREE.ShaderMaterial({
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        uniforms,
        vertexShader: VERTEX_SHADER,
      })
      const points = new THREE.Points(geometry, material)
      let animationFrame = 0
      let startTime = performance.now()

      fillParticleAttributes(positions, seeds, sizes, speeds)
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
      geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
      scene.add(points)

      const resize = () => {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
        renderer.setSize(window.innerWidth, window.innerHeight, false)
      }

      const render = (time: number) => {
        uniforms.uTime.value = (time - startTime) / 1000
        renderer.render(scene, camera)
        animationFrame = window.requestAnimationFrame(render)
      }

      const resetForMotionPreference = () => {
        if (reducedMotion.matches) {
          window.cancelAnimationFrame(animationFrame)
          renderer.clear()
          return
        }

        startTime = performance.now()
        animationFrame = window.requestAnimationFrame(render)
      }

      resize()
      renderer.render(scene, camera)
      canvas.dataset.particlesReady = 'true'
      animationFrame = window.requestAnimationFrame(render)
      window.addEventListener('resize', resize)
      reducedMotion.addEventListener('change', resetForMotionPreference)

      cleanupScene = () => {
        window.cancelAnimationFrame(animationFrame)
        window.removeEventListener('resize', resize)
        reducedMotion.removeEventListener('change', resetForMotionPreference)
        scene.remove(points)
        geometry.dispose()
        material.dispose()
        renderer.dispose()
        canvas.removeAttribute('data-particles-ready')
      }
    })

    return () => {
      cancelled = true
      cleanupScene()
    }
  }, [active, sceneKey])

  if (!active) {
    return null
  }

  return <canvas ref={canvasRef} className="magic-particles-canvas" />
}
