"""Everything that talks to the outside world: DDA parcels, OSM footprints, Esri tiles.

One rule holds across this package -- a fetch writes into an immutable dated snapshot and never
runs inside a render path. Anything downstream reads files, not the network."""
