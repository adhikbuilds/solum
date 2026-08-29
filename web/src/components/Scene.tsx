import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Grid, Html, Line, OrbitControls } from '@react-three/drei'
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

  // The geometry already spans [0, depth] locally after the rotate above, so the group only
  // needs to move to the slab's underside -- not underside-plus-depth, which was floating every
  // slab (basements included) by 0.9x its own height above where the panel says it sits.
  const y = level.base_m
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
          return { g, built: c.floors > 0 }
        }),
      ),
    [items],
  )
  return (
    <>
      {/* Geometry already spans [0, height] at ground after the rotate -- no group offset. It was
          sitting at group y=h, i.e. floated by its own full height, which is why every context
          block hovered above the grid instead of standing on it. */}
      {geoms.map(({ g, built }, i) => (
        <group key={i}>
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

// Fixed compass direction per layer, in the scene's XZ ground plane, so labels fan out to
// stable positions regardless of the actual footprint shape -- basements point south-west,
// podium south-east, tower north, and they never fight each other for space.
const LAYER_LEADER_DIR: Record<Level['kind'], readonly [number, number]> = {
  basement: [-1, 1],
  podium: [1, 1],
  tower: [0, -1],
}

const LAYER_TITLE: Record<Level['kind'], string> = {
  basement: 'Basement', podium: 'Podium', tower: 'Tower',
}

/**
 * One leader-line label per layer (not per storey -- a 9-floor tower is one "Tower" label, not
 * nine), pointing to the actual edge of that layer's footprint at its vertical midpoint.
 *
 * Ring coordinates are in the shape's own (x, y) plane; `shapeFromRing` + the -90deg rotateX used
 * for every solid here sends that y to world -z (verified empirically -- see LevelSlab/Context).
 * The projection below has to use that same mapping or the leader points at the wrong edge.
 */
function LayerLabel({ levels }: { levels: Level[] }) {
  const kind = levels[0].kind
  const [dx, dz] = LAYER_LEADER_DIR[kind]

  const { anchor, midY, detail } = useMemo(() => {
    const len = Math.hypot(dx, dz) || 1
    const ux = dx / len, uz = dz / len
    let best = -Infinity
    let ax = 0, az = 0
    for (const lv of levels) {
      for (const ring of lv.rings) {
        for (const [x, y] of ring) {
          const wx = x, wz = -y // shape-plane y -> world -z, per the shared rotateX(-PI/2)
          const proj = wx * ux + wz * uz
          if (proj > best) { best = proj; ax = wx; az = wz }
        }
      }
    }
    const base = Math.min(...levels.map((lv) => lv.base_m))
    const top = Math.max(...levels.map((lv) => lv.base_m + lv.height_m))
    const uses = Array.from(new Set(levels.map((lv) => lv.use)))
    const each = levels[0].height_m
    const countLabel = levels.length > 1 ? `${levels.length} × ${each} m` : `${each} m`
    return { anchor: [ax, az] as const, midY: (base + top) / 2, detail: `${countLabel} · ${uses.join(' + ')}` }
  }, [levels, dx, dz])

  const reach = 10 + levels.length * 1.5
  const labelPt: [number, number, number] = [anchor[0] + dx * reach, midY, anchor[1] + dz * reach]

  return (
    <>
      <Line
        points={[[anchor[0], midY, anchor[1]], labelPt]}
        color="#8A8378" lineWidth={1} dashed dashSize={1.4} gapSize={1}
      />
      <Html position={labelPt} center style={{ pointerEvents: 'none' }} zIndexRange={[0, 0]}>
        <div className="rounded border border-[#D9D4C8] bg-white/92 px-2 py-1 font-mono text-[10px] leading-tight whitespace-nowrap text-[#5B5347] shadow-sm">
          <div className="font-bold text-[#3A352C]">{LAYER_TITLE[kind]}</div>
          <div>{detail}</div>
        </div>
      </Html>
    </>
  )
}

/** Levels grouped into one entry per contiguous layer, for `LayerLabel`. */
function layerGroups(levels: Level[]): Level[][] {
  return (['tower', 'podium', 'basement'] as const)
    .map((kind) => levels.filter((lv) => lv.kind === kind))
    .filter((g) => g.length > 0)
}

/** North arrow, planted at a fixed corner of the framed extent. North is world -z here -- the
 * ring plane's +y axis (northing, per the wkid 3997 easting/northing source data) maps to -z
 * under the shared rotateX(-PI/2), the same mapping `LayerLabel` relies on. */
function Compass({ radius }: { radius: number }) {
  const len = Math.max(radius * 0.08, 6)
  const origin: [number, number, number] = [-radius * 0.9, 0.3, radius * 0.9]
  return (
    <group position={origin}>
      <Line points={[[0, 0, 0], [0, 0, -len]]} color="#5B5347" lineWidth={2} />
      <Line
        points={[[-len * 0.26, 0, -len * 0.62], [0, 0, -len], [len * 0.26, 0, -len * 0.62]]}
        color="#5B5347" lineWidth={2}
      />
      <Html position={[0, 0, -len * 1.4]} center style={{ pointerEvents: 'none' }}>
        <div className="font-mono text-[11px] font-bold tracking-wide text-[#5B5347]">N</div>
      </Html>
    </group>
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
      {solid && layerGroups(solid.levels).map((group) => <LayerLabel key={group[0].kind} levels={group} />)}

      <Compass radius={radius} />
      <Rig radius={radius} focusHeight={solid?.height_m ?? 20} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  )
}
