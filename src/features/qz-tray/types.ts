/**
 * Connection status for QZ Tray
 */
export type QzTrayConnectionStatus =
  | 'disconnected' // Not connected to QZ Tray
  | 'connecting' // Attempting to connect
  | 'connected' // Successfully connected
  | 'error' // Connection failed

/**
 * QZ Tray user preferences (persisted to localStorage)
 */
export interface QzTrayPreferences {
  /** Whether QZ Tray integration is enabled */
  enabled: boolean
  /** User's preferred printer name */
  selectedPrinterName: string | null
  /** Auto-print when QZ Tray is connected */
  autoPrint: boolean
}

/**
 * Print result information
 */
export interface QzPrintResult {
  success: boolean
  method: 'qz-tray' | 'chrome-print' | 'none'
  error?: string
}

/**
 * Options for the usePrintToQZTray hook
 */
export interface UsePrintToQZTrayOptions {
  /** Callback when print completes */
  onPrintEnd?: () => void
  /** Callback when print fails */
  onPrintError?: (error: Error) => void
}
