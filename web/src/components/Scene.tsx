import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Grid, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Level, Solid, Study } from '@/api/types'

const LAYER_COLOR: Record<Level['kind'], string> = {
  basement: '#9C9186',
  podium: '#C4763A',
  tower: '#FF6B19',
}
const LAYER_EDGE: Record<Level['kind'], string> = {
  basement: '#6B6158', podium: '#7A3D14', tower: '#8A3A0C',
}

function shapeFromRing(ring: number[][]) {
  const s = new THREE.Shape()
  ring.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  return s
}

/**
 * One extruded slab per storey, with a hairline gap.
 *
 * Extruding the whole stack as a single prism is cheaper and reads as a box; the gap is what
 * makes the model legible as a building. Geometry is memoised per level because a 49-storey
 * scheme rebuilds on every candidate change otherwise.
 */
function LevelSlab({ level }: { level: Level }) {
  const geoms = useMemo(() => {
    const depth = level.height_m * 0.9
    return level.rings.map((ring) => {
      const g = new THREE.ExtrudeGeometry(shapeFromRing(ring), { depth, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      return g
    })
  }, [level])

  const y = level.base_m + level.height_m * 0.9
  return (
    <>
      {geoms.map((g, i) => (
        <group key={i} position={[0, y, 0]}>
          <mesh geometry={g}>
            <meshLambertMaterial
              color={LAYER_COLOR[level.kind]}
              transparent={level.kind === 'basement'}
              opacity={level.kind === 'basement' ? 0.5 : 1}
            />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[g]} />
            <lineBasicMaterial color={LAYER_EDGE[level.kind]} transparent opacity={0.5} />
          </lineSegments>
        </group>
      ))}
    </>
  )
}

function Outline({ rings, color, y, width = 1 }: { rings: number[][][]; color: string; y: number; width?: number }) {
  return (
    <>
      {rings.map((ring, i) => (
        <Line key={i} points={ring.map(([x, z]) => [x, y, z] as [number, number, number])} color={color} lineWidth={width} />
      ))}
    </>
  )
}

/**
 * Neighbouring parcels at their own permitted height.
 *
 * A scheme floating in an empty grid reads as a diagram; the same scheme inside its actual block
 * reads as a site. These are real DDA parcels, extruded to the storey limit each one publishes --
 * so the tower next door is the height it is genuinely allowed to be, not scenery.
 */
function Context({ items }: { items: NonNullable<Study['context']> }) {
  const geoms = useMemo(
    () =>
      items.flatMap((c) =>
        c.rings.map((ring) => {
          const h = Math.max(c.height_m, 0.8)
          const g = new THREE.ExtrudeGeometry(shapeFromRing(ring), { depth: h, bevelEnabled: false })
          g.rotateX(-Math.PI / 2)
          return { g, h, built: c.floors > 0 }
        }),
      ),
    [items],
  )
  return (
    <>
      {geoms.map(({ g, h, built }, i) => (
        <group key={i} position={[0, h, 0]}>
          <mesh geometry={g}>
            <meshLambertMaterial color={built ? '#C7C2BB' : '#DCDAD4'} transparent opacity={built ? 0.92 : 0.6} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[g]} />
            <lineBasicMaterial color="#A9A29A" transparent opacity={0.4} />
          </lineSegments>
        </group>
      ))}
    </>
  )
}

function Rig({ radius, focusHeight }: { radius: number; focusHeight: number }) {
  const done = useRef(false)
  useFrame(({ camera }) => {
    if (done.current) return
    done.current = true
    // Frame the subject plot, not the context. The neighbours extend 260 m in every direction, so
    // fitting them all in shrinks the scheme to nothing -- they are there to give the scheme a
    // setting, not to be read themselves. Pitched high enough to see over the block.
    camera.position.set(radius * 0.62, radius * 0.78, radius * 0.62)
    camera.lookAt(0, focusHeight * 0.45, 0)
  })
  return null
}

export function Scene({ study, solid }: { study: Study; solid: Solid | undefined }) {
  const g = study.geometry
  // Frame the site from its own extent rather than a magic number, so a villa plot and a
  // 49-storey tower plot both open at a sensible distance.
  // Sized from the SUBJECT parcel only.
  const radius = useMemo(() => {
    const pts = g.parcel_rings.flat()
    const max = pts.reduce((m, [x, y]) => Math.max(m, Math.hypot(x, y)), 1)
    return Math.max(max * 2.1, (solid?.height_m ?? 30) * 2.6)
  }, [g.parcel_rings, solid?.height_m])

  return (
    <Canvas
      camera={{ fov: 42, near: 0.5, far: 12000, position: [radius, radius * 0.8, radius] }}
      dpr={[1, 2]}
      className="!absolute inset-0"
    >
      <color attach="background" args={['#EFF1F4']} />
      <fog attach="fog" args={['#EFF1F4', radius * 1.6, radius * 4.2]} />
      <hemisphereLight args={['#ffffff', '#C9B9A8', 1]} />
      <directionalLight position={[-radius * 0.5, radius, radius * 0.4]} intensity={0.6} />

      <Grid
        args={[radius * 8, radius * 8]}
        cellSize={10} cellColor="#DCE0E6"
        sectionSize={50} sectionColor="#C8CDD5"
        fadeDistance={radius * 3} fadeStrength={1.2}
        position={[0, -0.4, 0]} infiniteGrid
      />

      {study.context?.length ? <Context items={study.context} /> : null}

      <Outline rings={g.parcel_rings} color="#8E7B66" y={0.06} width={1.8} />
      <Outline rings={g.envelope_optimistic_rings} color="#8FA9C9" y={0.14} />
      <Outline rings={g.envelope_conservative_rings} color="#5C7CA6" y={0.22} width={1.4} />

      {solid?.levels.map((lv, i) => <LevelSlab key={`${solid.floors}-${i}`} level={lv} />)}

      <Rig radius={radius} focusHeight={solid?.height_m ?? 20} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  )
}
