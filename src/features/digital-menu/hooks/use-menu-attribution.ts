'use client'

import { useEffect, useRef, useState } from 'react'
import { recordDigitalMenuAttributionEvent } from '../api'
import {
  normalizeDigitalMenuAttribution,
  parseDigitalMenuAttributionSearchParams,
  type DigitalMenuAttribution,
} from '../attribution'

type Consent = 'unknown' | 'granted' | 'denied'
type State = {
  storeSlug: string
  candidate: DigitalMenuAttribution | null
  attribution: DigitalMenuAttribution | null
  consent: Consent
  busy: boolean
}

const privacyBlocked = () =>
  (navigator as Navigator & { globalPrivacyControl?: boolean })
    .globalPrivacyControl === true ||
  navigator.doNotTrack === '1' ||
  (window as Window & { doNotTrack?: string }).doNotTrack === '1'

export function useMenuAttribution(
  storeSlug: string,
  hasCart: boolean,
  disabled = false
) {
  const key = `clica-digital-menu-attribution:${storeSlug}`
  const consentKey = `clica-digital-menu-attribution-consent:${storeSlug}`
  const generation = useRef(0)
  const cartAttempts = useRef(new Set<string>())
  const [state, setState] = useState<State>({
    storeSlug,
    candidate: null,
    attribution: null,
    consent: 'unknown',
    busy: false,
  })

  useEffect(() => {
    generation.current++
    let candidate: DigitalMenuAttribution | null = null
    let consent: Consent = 'unknown'
    try {
      if (disabled || privacyBlocked()) {
        window.sessionStorage.removeItem(key)
        consent = 'denied'
      } else {
        const params = new URLSearchParams(window.location.search)
        const fromUrl = parseDigitalMenuAttributionSearchParams(params)
        const stored = normalizeDigitalMenuAttribution(
          JSON.parse(window.sessionStorage.getItem(key) ?? 'null')
        )
        const hasAttributionParams = [
          'utm_source',
          'utm_medium',
          'utm_campaign',
          'wa_conversation',
          'wa_message',
        ].some(p => params.has(p))
        candidate = hasAttributionParams ? fromUrl : stored
        if (
          fromUrl &&
          stored?.conversationId === fromUrl.conversationId &&
          stored.messageId === fromUrl.messageId
        )
          candidate = stored
        const previous = window.sessionStorage.getItem(consentKey)
        if (previous === 'granted' || previous === 'denied') consent = previous
        if (!candidate || consent === 'denied')
          window.sessionStorage.removeItem(key)
      }
    } catch {
      // No reliable session storage means no measurement, not a broken menu.
      candidate = null
      consent = 'denied'
    }
    setState({ storeSlug, candidate, attribution: null, consent, busy: false })
    return () => {
      generation.current++
    }
  }, [key, consentKey, storeSlug, disabled])

  useEffect(() => {
    if (
      state.storeSlug !== storeSlug ||
      state.consent !== 'granted' ||
      !state.candidate ||
      disabled
    )
      return
    const currentGeneration = ++generation.current
    const candidate = state.candidate
    let visitId = candidate.visitId
    try {
      const stored = normalizeDigitalMenuAttribution(
        JSON.parse(window.sessionStorage.getItem(key) ?? 'null')
      )
      if (
        stored?.conversationId === candidate.conversationId &&
        stored.messageId === candidate.messageId
      )
        visitId ??= stored.visitId
    } catch {}
    visitId ??= crypto.randomUUID()
    const attribution = { ...candidate, visitId }
    let disposed = false
    setState(s => ({ ...s, busy: true, attribution: null }))
    const record = async () => {
      try {
        if (privacyBlocked()) return
        window.sessionStorage.setItem(key, JSON.stringify(attribution))
        const result = await recordDigitalMenuAttributionEvent({
          storeSlug,
          attribution,
          visitId,
          stage: 'access',
          consent: true,
        })
        if (!disposed && currentGeneration === generation.current)
          setState(s => ({
            ...s,
            attribution:
              result.ok && result.visitId === visitId ? attribution : null,
          }))
      } catch {
        // Optional analytics cannot prevent checkout.
      } finally {
        if (!disposed && currentGeneration === generation.current)
          setState(s => ({ ...s, busy: false }))
      }
    }
    void record()
    return () => {
      disposed = true
    }
  }, [
    state.storeSlug,
    state.consent,
    state.candidate,
    storeSlug,
    key,
    disabled,
  ])

  useEffect(() => {
    const attribution = state.storeSlug === storeSlug ? state.attribution : null
    const visitId = attribution?.visitId
    if (
      !hasCart ||
      !visitId ||
      state.consent !== 'granted' ||
      disabled ||
      privacyBlocked() ||
      cartAttempts.current.has(visitId)
    )
      return
    cartAttempts.current.add(visitId)
    void recordDigitalMenuAttributionEvent({
      storeSlug,
      attribution,
      visitId,
      stage: 'cart',
      consent: true,
    }).catch(() => {})
  }, [
    hasCart,
    state.attribution,
    state.storeSlug,
    state.consent,
    storeSlug,
    disabled,
  ])

  const decide = (consent: Consent) => {
    generation.current++
    try {
      if (consent === 'unknown') window.sessionStorage.removeItem(consentKey)
      else window.sessionStorage.setItem(consentKey, consent)
      if (consent !== 'granted') window.sessionStorage.removeItem(key)
    } catch {
      consent = 'denied'
    }
    setState(s => ({
      ...s,
      consent,
      busy: false,
      attribution: null,
      candidate: s.attribution ?? s.candidate,
    }))
  }

  const clear = () => {
    generation.current++
    try {
      window.sessionStorage.removeItem(key)
    } catch {}
    setState(s => ({ ...s, candidate: null, attribution: null, busy: false }))
  }
  const active = state.storeSlug === storeSlug && !disabled
  return {
    attribution: active ? state.attribution : null,
    askConsent: active && !!state.candidate && state.consent === 'unknown',
    canManageConsent: active && !!state.candidate,
    busy: active && state.busy,
    accept: () => decide('granted'),
    decline: () => decide('denied'),
    manageConsent: () => decide('unknown'),
    clear,
  }
}
