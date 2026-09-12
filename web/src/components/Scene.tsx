import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Grid, Html, Line, OrbitControls, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import type { Basemap, Level, Solid, Study } from '@/api/types'

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
 * The neighbouring block: buildings where one can be derived, plot outlines where it cannot.
 *
 * The service now sends a derived plate (permitted GFA over permitted storeys) rather than the
 * whole parcel, so these read as buildings standing on land. Extruding the full parcel -- what
 * this drew before -- turns a 200 x 100 m plot into a solid wall, and a block of them into grey
 * slabs that swamp the scheme they were meant to give a setting.
 *
 * `floors: 0` means there was no GFA or storey limit to derive a plate from. Those are drawn as
 * a ground outline: the plot is real, the building on it is unknown, and inventing one would be
 * the same mistake in a subtler form.
 */
function Context({ items, overImagery }: { items: NonNullable<Study['context']>; overImagery: boolean }) {
  const built = useMemo(() => items.filter((c) => c.floors > 0), [items])
  const outlined = useMemo(() => items.filter((c) => c.floors <= 0), [items])

  const geoms = useMemo(
    () =>
      built.flatMap((c) =>
        c.rings.map((ring) => {
          const g = new THREE.ExtrudeGeometry(shapeFromRing(ring), { depth: c.height_m, bevelEnabled: false })
          g.rotateX(-Math.PI / 2)
          return g
        }),
      ),
    [built],
  )

  return (
    <>
      {/* Geometry already spans [0, height] at ground after the rotate -- no group offset. It was
          sitting at group y=h, i.e. floated by its own full height, which is why every context
          block hovered above the grid instead of standing on it. */}
      {geoms.map((g, i) => (
        <group key={i}>
          <mesh geometry={g}>
            {/* Over imagery these must not read as the buildings that are actually there. They
                are permitted volume -- GFA over storeys -- and the photo beneath already shows
                what is built, which is often nothing. Translucent says "envelope", not "block". */}
            <meshLambertMaterial
              color="#C7C2BB"
              transparent={overImagery}
              opacity={overImagery ? 0.42 : 1}
              depthWrite={!overImagery}
            />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[g]} />
            <lineBasicMaterial color="#A9A29A" transparent opacity={0.45} />
          </lineSegments>
        </group>
      ))}

      {outlined.map((c, i) => (
        <Outline key={`ctx-${i}`} rings={c.rings} color="#C6C1B9" y={0.02} width={1} />
      ))}
    </>
  )
}

/**
 * Satellite imagery on the ground, one textured quad per tile.
 *
 * The service sends each tile's four corners already in scene-local metres, so nothing here
 * reprojects anything -- the imagery is fitted to the model, never the other way round. Drawn as
 * an explicit quad rather than a positioned plane because a Web Mercator tile is only very nearly
 * axis-aligned once it lands in Dubai's wkid 3997, and "very nearly" is not worth hard-coding.
 *
 * Sits fractionally below the parcel outline so the two never z-fight.
 */
function BasemapTiles({ map }: { map: Basemap }) {
  const urls = useMemo(() => map.tiles.map((t) => t.url), [map])
  const textures = useTexture(urls)
  const list = Array.isArray(textures) ? textures : [textures]

  return (
    <>
      {map.tiles.map((t, i) => {
        const [nw, ne, se, sw] = t.corners
        // Two triangles over the four corners, with UVs the same way round as the corner list.
        const positions = new Float32Array([
          nw[0], 0, nw[1], se[0], 0, se[1], ne[0], 0, ne[1],
          nw[0], 0, nw[1], sw[0], 0, sw[1], se[0], 0, se[1],
        ])
        const uv = new Float32Array([0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0])
        return (
          <mesh key={t.url} position={[0, -0.05, 0]} renderOrder={-1}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[positions, 3]} />
              <bufferAttribute attach="attributes-uv" args={[uv, 2]} />
            </bufferGeometry>
            <meshBasicMaterial map={list[i]} toneMapped={false} />
          </mesh>
        )
      })}
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

/**
 * Frame the subject plot on load, and re-frame whenever the subject changes.
 *
 * This latched on the first frame of the Canvas's life and never fired again. The Canvas does not
 * remount between plots, so every plot after the first was viewed through the camera fitted to
 * whichever one happened to load first -- open the 204,460 sqft demo plot, then study a 19,390
 * sqft one, and the second is framed for a site seven times its size.
 *
 * Keyed on the framing inputs rather than a mount flag, so it re-fits exactly when the thing it
 * is fitting to changes, and stays out of the way of orbiting in between.
 */
function Rig({ radius, focusHeight }: { radius: number; focusHeight: number }) {
  const framed = useRef<string>('')
  useFrame(({ camera }) => {
    const key = `${radius.toFixed(2)}:${focusHeight.toFixed(2)}`
    if (framed.current === key) return
    framed.current = key
    // Frame the subject plot, not the whole context -- fitting every neighbour shrinks the scheme
    // to nothing. But framing on the subject alone put the camera inside the block: on plot
    // 3156269 the two nearest neighbours begin 31 m out, span 50 m and stand 22.4 m tall, as tall
    // as the scheme itself, while the camera sat 63 m away. They filled the frame.
    //
    // So: further out, and pitched steeper, to clear a ring of buildings the same height as the
    // subject rather than looking through them.
    camera.position.set(radius * 0.72, radius * 1.15, radius * 0.72)
    camera.lookAt(0, focusHeight * 0.35, 0)
  })
  return null
}

export function Scene({ study, solid }: { study: Study; solid: Solid | undefined }) {
  const g = study.geometry
  // Frame the site from its own extent rather than a magic number, so a villa plot and a
  // 49-storey tower plot both open at a sensible distance.
  // Sized from the SUBJECT parcel only.
  const radius = useMemo(() => {
    const own = g.parcel_rings.flat().reduce((m, [x, y]) => Math.max(m, Math.hypot(x, y)), 1)
    // Frame the block, not just the parcel. Context used to be a fixed 260 m ring, so fitting it
    // shrank the scheme to nothing and the camera was pinned to the subject instead -- which put
    // it inside a ring of neighbours as tall as the scheme. The service now scales that ring to
    // the site and clips it to a disc, so the whole block is a sensible thing to fit, and the
    // subject sits in the middle of its surroundings rather than pressed against them.
    const block = (study.context ?? [])
      .flatMap((c) => c.rings.flat())
      .reduce((m, [x, y]) => Math.max(m, Math.hypot(x, y)), own)
    return Math.max(Math.min(block, own * 4) * 1.15, (solid?.height_m ?? 30) * 2.2)
  }, [g.parcel_rings, study.context, solid?.height_m])

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

      {/* The abstract grid is what you show when there is no ground. With imagery under the
          model it is competing texture, so it only appears when the basemap is absent. */}
      {study.basemap?.tiles.length ? (
        <Suspense fallback={null}>
          <BasemapTiles map={study.basemap} />
        </Suspense>
      ) : (
        <Grid
          args={[radius * 8, radius * 8]}
          cellSize={10} cellColor="#DCE0E6"
          sectionSize={50} sectionColor="#C8CDD5"
          fadeDistance={radius * 3} fadeStrength={1.2}
          position={[0, -0.4, 0]} infiniteGrid
        />
      )}

      {study.context?.length ? (
        <Context items={study.context} overImagery={!!study.basemap?.tiles.length} />
      ) : null}

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

/**
 * One plot's winning scheme at thumbnail size, for the screening grid.
 *
 * Shares `LevelSlab` and the layer colours with the full viewer, so a scheme looks the same in the
 * grid as it does when opened. Stripped of everything that needs room to be read: no context, no
 * leader labels, no compass, no controls.
 *
 * `radius` is passed in rather than derived per plot, so every thumbnail in a grid is drawn at one
 * metres-per-pixel. Fitting each canvas to its own parcel would render a 204,460 sqft plot and a
 * 15,008 sqft plot at the same apparent size, which inverts the comparison the grid exists for.
 */
export function MassingThumb({
  levels, parcelRings, envelopeRings, radius,
}: {
  levels: Level[]
  parcelRings: number[][][]
  envelopeRings: number[][][]
  radius: number
}) {
  return (
    <Canvas
      camera={{ fov: 38, near: 0.5, far: radius * 20, position: [radius * 0.78, radius * 1.05, radius * 0.78] }}
      dpr={[1, 2]}
      className="!absolute inset-0"
      frameloop="demand"
    >
      <color attach="background" args={['#F4F5F7']} />
      <hemisphereLight args={['#ffffff', '#C9B9A8', 1]} />
      <directionalLight position={[-radius * 0.5, radius, radius * 0.4]} intensity={0.6} />
      <Outline rings={parcelRings} color="#8E7B66" y={0.04} width={1.2} />
      <Outline rings={envelopeRings} color="#5C7CA6" y={0.1} width={1} />
      {levels.map((lv, i) => <LevelSlab key={i} level={lv} />)}
      <ThumbRig radius={radius} />
    </Canvas>
  )
}

function ThumbRig({ radius }: { radius: number }) {
  const framed = useRef(0)
  useFrame(({ camera }) => {
    if (framed.current === radius) return
    framed.current = radius
    camera.position.set(radius * 0.78, radius * 1.05, radius * 0.78)
    camera.lookAt(0, 0, 0)
  })
  return null
}
