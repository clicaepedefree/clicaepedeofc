'use client'

import { useAtomValue } from 'jotai'
import { useCallback, useState } from 'react'
import { getQzTrayClient } from '../lib/qz-tray-client'
import {
  isQzTrayConnectedAtom,
  isQzTrayEnabledAtom,
  qzTrayPreferencesAtom,
  shouldUseQzTrayPrintingAtom,
} from '../state'
import { QzPrintResult, UsePrintToQZTrayOptions } from '../types'

/**
 * Hook for smart printing with QZ Tray fallback.
 *
 * Behavior:
 * 1. If QZ Tray enabled + connected → print via QZ Tray
 * 2. If QZ Tray enabled but NOT connected → show warning, offer retry or Chrome print
 * 3. If QZ Tray NOT enabled → delegate to Chrome print (return false)
 */
export function usePrintToQZTray(options?: UsePrintToQZTrayOptions) {
  const { onPrintEnd, onPrintError } = options ?? {}

  const isEnabled = useAtomValue(isQzTrayEnabledAtom)
  const isConnected = useAtomValue(isQzTrayConnectedAtom)
  const shouldUseQzTray = useAtomValue(shouldUseQzTrayPrintingAtom)
  const preferences = useAtomValue(qzTrayPreferencesAtom)

  const [isPrinting, setIsPrinting] = useState(false)
  const [printError, setPrintError] = useState<Error | null>(null)
  const [lastSvg, setLastSvg] = useState<string | null>(null)
  const [lastPrintMethod, setLastPrintMethod] = useState<'qz-tray' | 'chrome-print' | 'none' | null>(null)

  /**
   * Convert SVG string to PNG base64 for QZ Tray printing.
   * QZ Tray requires raster images (PNG), not vector (SVG).
   */
  const svgToPngBase64 = useCallback(async (svg: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // White background for transparency
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)

        // Export as PNG base64
        const dataUrl = canvas.toDataURL('image/png')
        const base64 = dataUrl.split(',')[1]

        console.log('[svgToPngBase64] Converted SVG to PNG', {
          svgLength: svg.length,
          canvasSize: `${canvas.width}x${canvas.height}`,
          base64Length: base64.length,
        })

        resolve(base64)
      }

      img.onerror = (e) => {
        console.error('[svgToPngBase64] Failed to load SVG', e)
        reject(new Error('Failed to load SVG image'))
      }

      // Load SVG as data URL
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
  }, [])

  /**
   * Print via QZ Tray
   */
  const printViaQzTray = useCallback(
    async (svg: string): Promise<QzPrintResult> => {
      const client = getQzTrayClient()
      const printerName = preferences.selectedPrinterName

      if (!printerName) {
        return {
          success: false,
          method: 'qz-tray',
          error: 'No printer selected',
        }
      }

      // Ensure connection is active before printing
      if (!client.isConnected()) {
        console.log('[printViaQzTray] Not connected, attempting to reconnect...')
        try {
          await client.connect()
        } catch (connectError) {
          console.error('[printViaQzTray] Reconnection failed:', connectError)
          return {
            success: false,
            method: 'qz-tray',
            error: 'Failed to connect to QZ Tray. Please check if QZ Tray is running.',
          }
        }
      }

      try {
        // Convert SVG to PNG base64 for printing (QZ Tray needs raster images)
        const base64 = await svgToPngBase64(svg)
        console.log('[printViaQzTray] Sending to printer:', printerName)
        await client.printImage(printerName, base64)

        return {
          success: true,
          method: 'qz-tray',
        }
      } catch (error) {
        console.error('[printViaQzTray] Print failed:', error)
        const errorMessage = error instanceof Error ? error.message : 'Print failed'

        // Provide more helpful error messages
        let userMessage = errorMessage
        if (errorMessage.includes('Connection closed')) {
          userMessage = 'QZ Tray connection was closed. Please check QZ Tray permissions for localhost in Site Manager (Advanced → Site Manager).'
        }

        return {
          success: false,
          method: 'qz-tray',
          error: userMessage,
        }
      }
    },
    [preferences.selectedPrinterName, svgToPngBase64]
  )

  /**
   * Main print function.
   * Returns whether QZ Tray handled the print (true) or if Chrome print should be used (false).
   */
  const printWithQzTray = useCallback(
    async (svg: string): Promise<QzPrintResult> => {
      setLastSvg(svg)
      setIsPrinting(true)
      setPrintError(null)

      // If QZ Tray is not enabled, delegate to Chrome print
      if (!isEnabled) {
        setIsPrinting(false)
        setLastPrintMethod(null)
        return {
          success: false,
          method: 'none',
          error: 'QZ Tray not enabled',
        }
      }

      // If QZ Tray is enabled but not connected
      if (!isConnected || !shouldUseQzTray) {
        setIsPrinting(false)
        setLastPrintMethod(null)
        return {
          success: false,
          method: 'none',
          error: 'QZ Tray not connected',
        }
      }

      // Print via QZ Tray
      const result = await printViaQzTray(svg)
      setIsPrinting(false)
      setLastPrintMethod(result.method)

      if (result.success) {
        onPrintEnd?.()
      } else {
        const error = new Error(result.error || 'Print failed')
        setPrintError(error)
        onPrintError?.(error)
      }

      return result
    },
    [isEnabled, isConnected, shouldUseQzTray, printViaQzTray, onPrintEnd, onPrintError]
  )

  /**
   * Retry the last print
   */
  const retryPrint = useCallback(async (): Promise<QzPrintResult | null> => {
    if (!lastSvg) {
      return null
    }

    return printWithQzTray(lastSvg)
  }, [lastSvg, printWithQzTray])

  /**
   * Clear the print error
   */
  const clearError = useCallback(() => {
    setPrintError(null)
  }, [])

  return {
    // Print function
    printWithQzTray,
    retryPrint,
    clearError,

    // State
    isPrinting,
    printError,
    lastPrintMethod,
    canRetry: !!lastSvg,

    // QZ Tray status
    isQzTrayEnabled: isEnabled,
    isQzTrayConnected: isConnected,
    shouldUseQzTray,

    // Info for fallback UI
    showConnectionWarning: isEnabled && !isConnected,
    selectedPrinter: preferences.selectedPrinterName,
  }
}
