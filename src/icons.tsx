/**
 * Icons.
 *
 * There is not a single SVG in this game. Every icon is a PNG photographed from
 * a real 3D model in `src/bake/iconModels.ts` — and the subject icons are the
 * street's OWN models, so the scooter on a rule chip is the scooter the vehicle
 * drives around. Re-bake with `npm run bake:icons`.
 *
 * A baked pixel cannot inherit `currentColor`, so the interface glyphs are shot
 * twice: navy for light surfaces, white for the orange and mint fills. Pass
 * `light` to pick the white one.
 *
 * IconVan is baked (it becomes the browser tab icon, inlined into index.html as
 * a data URI) but deliberately not exported: an unreferenced PNG would ship in
 * the offline package for nothing.
 */

import IconArrowLeftPng from './assets/icons/icon-arrow-left.png'
import IconArrowRightPng from './assets/icons/icon-arrow-right.png'
import IconBlockedPng from './assets/icons/icon-blocked.png'
import IconCameraPng from './assets/icons/icon-camera.png'
import IconCheckPng from './assets/icons/icon-check.png'
import IconCrowdPng from './assets/icons/icon-crowd.png'
import IconCyclistPng from './assets/icons/icon-cyclist.png'
import IconDeliverPng from './assets/icons/icon-deliver.png'
import IconDogPng from './assets/icons/icon-dog.png'
import IconDropoffPng from './assets/icons/icon-dropoff.png'
import IconEaseOffPng from './assets/icons/icon-ease-off.png'
import IconFogPng from './assets/icons/icon-fog.png'
import IconFullStopPng from './assets/icons/icon-full-stop.png'
import IconGiveSpacePng from './assets/icons/icon-give-space.png'
import IconHonkPng from './assets/icons/icon-honk.png'
import IconKeepSpeedPng from './assets/icons/icon-keep-speed.png'
import IconLightbulbPng from './assets/icons/icon-lightbulb.png'
import IconLockPng from './assets/icons/icon-lock.png'
import IconMoveAsidePng from './assets/icons/icon-move-aside.png'
import IconMovingPng from './assets/icons/icon-moving.png'
import IconNarrowPng from './assets/icons/icon-narrow.png'
import IconPlayPng from './assets/icons/icon-play.png'
import IconRacePng from './assets/icons/icon-race.png'
import IconRainPng from './assets/icons/icon-rain.png'
import IconRestartPng from './assets/icons/icon-restart.png'
import IconRoutePng from './assets/icons/icon-route.png'
import IconScooterPng from './assets/icons/icon-scooter.png'
import IconSensorPng from './assets/icons/icon-sensor.png'
import IconSirenPng from './assets/icons/icon-siren.png'
import IconSlowPassPng from './assets/icons/icon-slow-pass.png'
import IconSoundPng from './assets/icons/icon-sound.png'
import IconSoundOffPng from './assets/icons/icon-sound-off.png'
import IconSpeedUpPng from './assets/icons/icon-speed-up.png'
import IconStopSafePng from './assets/icons/icon-stop-safe.png'
import IconSunnyPng from './assets/icons/icon-sunny.png'
import IconTrashPng from './assets/icons/icon-trash.png'
import IconTurnAroundPng from './assets/icons/icon-turn-around.png'
import IconWaitPng from './assets/icons/icon-wait.png'
import IconArrowLeftLightPng from './assets/icons/icon-arrow-left-light.png'
import IconArrowRightLightPng from './assets/icons/icon-arrow-right-light.png'
import IconCameraLightPng from './assets/icons/icon-camera-light.png'
import IconCheckLightPng from './assets/icons/icon-check-light.png'
import IconLightbulbLightPng from './assets/icons/icon-lightbulb-light.png'
import IconLockLightPng from './assets/icons/icon-lock-light.png'
import IconPlayLightPng from './assets/icons/icon-play-light.png'
import IconRestartLightPng from './assets/icons/icon-restart-light.png'
import IconRouteLightPng from './assets/icons/icon-route-light.png'
import IconSensorLightPng from './assets/icons/icon-sensor-light.png'
import IconSoundLightPng from './assets/icons/icon-sound-light.png'
import IconSoundOffLightPng from './assets/icons/icon-sound-off-light.png'
import IconTrashLightPng from './assets/icons/icon-trash-light.png'

export interface IconProps {
  /** Use the white variant, for icons sitting on a coloured fill. */
  light?: boolean
}

function icon(dark: string, lightSrc?: string) {
  return function Icon({ light = false }: IconProps) {
    return (
      <img
        className="ico"
        src={light && lightSrc ? lightSrc : dark}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    )
  }
}

export const IconArrowLeft = icon(IconArrowLeftPng, IconArrowLeftLightPng)
export const IconArrowRight = icon(IconArrowRightPng, IconArrowRightLightPng)
export const IconBlocked = icon(IconBlockedPng)
export const IconCamera = icon(IconCameraPng, IconCameraLightPng)
export const IconCheck = icon(IconCheckPng, IconCheckLightPng)
export const IconCrowd = icon(IconCrowdPng)
export const IconCyclist = icon(IconCyclistPng)
export const IconDeliver = icon(IconDeliverPng)
export const IconDog = icon(IconDogPng)
export const IconDropoff = icon(IconDropoffPng)
export const IconEaseOff = icon(IconEaseOffPng)
export const IconFog = icon(IconFogPng)
export const IconFullStop = icon(IconFullStopPng)
export const IconGiveSpace = icon(IconGiveSpacePng)
export const IconHonk = icon(IconHonkPng)
export const IconKeepSpeed = icon(IconKeepSpeedPng)
export const IconLightbulb = icon(IconLightbulbPng, IconLightbulbLightPng)
export const IconLock = icon(IconLockPng, IconLockLightPng)
export const IconMoveAside = icon(IconMoveAsidePng)
export const IconMoving = icon(IconMovingPng)
export const IconNarrow = icon(IconNarrowPng)
export const IconPlay = icon(IconPlayPng, IconPlayLightPng)
export const IconRace = icon(IconRacePng)
export const IconRain = icon(IconRainPng)
export const IconRestart = icon(IconRestartPng, IconRestartLightPng)
export const IconRoute = icon(IconRoutePng, IconRouteLightPng)
export const IconScooter = icon(IconScooterPng)
export const IconSensor = icon(IconSensorPng, IconSensorLightPng)
export const IconSiren = icon(IconSirenPng)
export const IconSlowPass = icon(IconSlowPassPng)
export const IconSoundOn = icon(IconSoundPng, IconSoundLightPng)
export const IconSoundOff = icon(IconSoundOffPng, IconSoundOffLightPng)
export const IconSpeedUp = icon(IconSpeedUpPng)
export const IconStopSafe = icon(IconStopSafePng)
export const IconSunny = icon(IconSunnyPng)
export const IconTrash = icon(IconTrashPng, IconTrashLightPng)
export const IconTurnAround = icon(IconTurnAroundPng)
export const IconWait = icon(IconWaitPng)

/** The mute control asks for one icon with two states. */
export function IconSound({ off, light }: IconProps & { off?: boolean }) {
  return off ? <IconSoundOff light={light} /> : <IconSoundOn light={light} />
}

/**
 * Which icon stands for which rule token.
 *
 * Situations map to the street's own models, actions to the bevelled action
 * glyphs — so a chip in the rule builder shows the very object the vehicle will
 * meet on the road.
 */
export const TILE_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  // Situations.
  SCOOTER: IconScooter,
  NARROW: IconNarrow,
  ARRIVED: IconDropoff,
  MOVING: IconMoving,
  CLEAR_SKY: IconSunny,
  MANY_MOVING: IconCrowd,
  ROAD_WET: IconRain,
  EMERGENCY_BEHIND: IconSiren,
  CYCLIST: IconCyclist,
  DOG: IconDog,
  ROAD_BLOCKED: IconBlocked,
  DEAD_END: IconNarrow,
  FOG: IconFog,
  // Actions.
  SLOW: IconSlowPass,
  DELIVER: IconDeliver,
  FULLSTOP: IconFullStop,
  TURN: IconTurnAround,
  SPEEDUP: IconSpeedUp,
  WAIT_CLEAR: IconWait,
  SLOW_EARLY: IconEaseOff,
  LEAVE_SPACE: IconGiveSpace,
  MOVE_ASIDE: IconMoveAside,
  STOP_SAFE: IconStopSafe,
  HONK: IconHonk,
  NORMAL_SPEED: IconKeepSpeed,
  RACE_AHEAD: IconRace,
}
