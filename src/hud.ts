import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * The HUD bus: what the SKAI board's live CTA plate says and does right now.
 *
 * The board artwork carries ONE primary action plate. Each screen owns the
 * mission, so each screen tells the plate its label, whether it is armed, and
 * what pressing it means. The handler lives outside React state so a re-render
 * never races a click.
 */
interface HudState {
  ctaLabel: string
  ctaDisabled: boolean
  /** What the hint bulb should whisper right now — set by the live screen. */
  hint: string | null
  /** True while a situation popup owns the screen: the board chrome comes
   *  back to full strength behind it. */
  spotlight: boolean
  setCta: (label: string, disabled: boolean, action: (() => void) | null) => void
  setHint: (hint: string | null) => void
  setSpotlight: (on: boolean) => void
}

let ctaAction: (() => void) | null = null

export const useHud = create<HudState>((set) => ({
  ctaLabel: 'NEXT',
  ctaDisabled: true,
  hint: null,
  setCta: (ctaLabel, ctaDisabled, action) => {
    ctaAction = action
    set((s) => (s.ctaLabel === ctaLabel && s.ctaDisabled === ctaDisabled ? s : { ctaLabel, ctaDisabled }))
  },
  setHint: (hint) => set((s) => (s.hint === hint ? s : { hint })),
  spotlight: false,
  setSpotlight: (spotlight) => set((s) => (s.spotlight === spotlight ? s : { spotlight })),
}))

export function fireCta() {
  if (!useHud.getState().ctaDisabled) ctaAction?.()
}

/** Declare this screen's CTA. Re-registers whenever the inputs change. */
export function useCta(label: string, disabled: boolean, action: () => void) {
  const setCta = useHud((s) => s.setCta)
  useEffect(() => {
    setCta(label, disabled, action)
  })
}
