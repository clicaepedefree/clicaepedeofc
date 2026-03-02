import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { QzTrayConnectionStatus, QzTrayPreferences } from './types'

// Default preferences
const defaultPreferences: QzTrayPreferences = {
  enabled: false,
  selectedPrinterName: null,
  autoPrint: true,
}

/**
 * Persisted user preferences (survives page refresh)
 */
export const qzTrayPreferencesAtom = atomWithStorage<QzTrayPreferences>(
  'qzTrayPreferences',
  defaultPreferences
)

/**
 * Runtime connection status (not persisted)
 */
export const qzTrayConnectionStatusAtom = atom<QzTrayConnectionStatus>('disconnected')

/**
 * List of available printers (not persisted)
 */
export const qzTrayPrintersAtom = atom<string[]>([])

/**
 * Last connection error (not persisted)
 */
export const qzTrayLastErrorAtom = atom<string | null>(null)

// ============================================
// Derived atoms
// ============================================

/**
 * Whether QZ Tray integration is enabled in preferences
 */
export const isQzTrayEnabledAtom = atom(get => get(qzTrayPreferencesAtom).enabled)

/**
 * Whether QZ Tray is currently connected
 */
export const isQzTrayConnectedAtom = atom(get => get(qzTrayConnectionStatusAtom) === 'connected')

/**
 * The currently selected printer name
 */
export const selectedPrinterAtom = atom(get => get(qzTrayPreferencesAtom).selectedPrinterName)

/**
 * Whether we should use QZ Tray for printing
 * True only if: enabled + connected + printer selected
 */
export const shouldUseQzTrayPrintingAtom = atom(get => {
  const preferences = get(qzTrayPreferencesAtom)
  const status = get(qzTrayConnectionStatusAtom)
  return preferences.enabled && status === 'connected' && !!preferences.selectedPrinterName
})

// ============================================
// Write atoms for updating preferences
// ============================================

/**
 * Update the enabled state
 */
export const setQzTrayEnabledAtom = atom(null, (get, set, enabled: boolean) => {
  const current = get(qzTrayPreferencesAtom)
  set(qzTrayPreferencesAtom, { ...current, enabled })
})

/**
 * Update the selected printer
 */
export const setSelectedPrinterAtom = atom(null, (get, set, printerName: string | null) => {
  const current = get(qzTrayPreferencesAtom)
  set(qzTrayPreferencesAtom, { ...current, selectedPrinterName: printerName })
})

/**
 * Update the auto-print setting
 */
export const setAutoPrintAtom = atom(null, (get, set, autoPrint: boolean) => {
  const current = get(qzTrayPreferencesAtom)
  set(qzTrayPreferencesAtom, { ...current, autoPrint })
})
