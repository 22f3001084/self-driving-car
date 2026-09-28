import SceneImpl from '@scene'

/**
 * Which renderer this build uses.
 *
 * The game logic never knows: both scenes speak the same four commands. The 3D
 * street is the default; building with VITE_SCENE_2D=1 produces the flat classic
 * edition on the retired sprite art, into its own folder next to the 3D one.
 *
 * The choice is made by a build-time ALIAS (`@scene` in vite.config.ts), not by
 * a ternary here, and that matters more than it looks. It used to import both
 * and pick one at runtime — and an ES import keeps a module in the graph
 * whatever you do with it afterwards, so the 3D build shipped every sprite the
 * flat edition uses: three megabytes of retired PNGs, in a bundle that can never
 * draw a single one of them.
 */
export { WORLD, STOP_GAP } from '../three/stage'
export type { SceneCommand, SceneMode } from '../three/stage'
export { markFor, placeFor } from '../three/stage'

export default SceneImpl
