'use client'

import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useRef } from 'react'
import { getQzTrayClient } from '../lib/qz-tray-client'
import {
  isQzTrayConnectedAtom,
  isQzTrayEnabledAtom,
  qzTrayConnectionStatusAtom,
  qzTrayLastErrorAtom,
  qzTrayPreferencesAtom,
  qzTrayPrintersAtom,
  setAutoPrintAtom,
  setQzTrayEnabledAtom,
  setSelectedPrinterAtom,
} from '../state'
import { QzTrayConnectionStatus } from '../types'

/**
 * Hook for managing QZ Tray connection state.
 *
 * Provides:
 * - Connection status
 * - Available printers
 * - Connect/disconnect functions
 * - Auto-reconnection logic
 */
export function useQzTray() {
  const [status, setStatus] = useAtom(qzTrayConnectionStatusAtom)
  const [printers, setPrinters] = useAtom(qzTrayPrintersAtom)
  const [lastError, setLastError] = useAtom(qzTrayLastErrorAtom)
  const preferences = useAtomValue(qzTrayPreferencesAtom)
  const isEnabled = useAtomValue(isQzTrayEnabledAtom)
  const isConnected = useAtomValue(isQzTrayConnectedAtom)

  const setEnabled = useSetAtom(setQzTrayEnabledAtom)
  const setSelectedPrinter = useSetAtom(setSelectedPrinterAtom)
  const setAutoPrint = useSetAtom(setAutoPrintAtom)

  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 3

  /**
   * Connect to QZ Tray
   */
  const connect = useCallback(async () => {
    const client = getQzTrayClient()

    setStatus('connecting')
    setLastError(null)

    try {
      await client.connect()
      setStatus('connected')
      reconnectAttemptsRef.current = 0

      // Fetch available printers
      const availablePrinters = await client.getPrinters()
      setPrinters(availablePrinters)

      // If no printer selected yet, try to select the default
      if (!preferences.selectedPrinterName && availablePrinters.length > 0) {
        const defaultPrinter = await client.getDefaultPrinter()
        if (defaultPrinter && availablePrinters.includes(defaultPrinter)) {
          setSelectedPrinter(defaultPrinter)
        } else {
          setSelectedPrinter(availablePrinters[0])
        }
      }
    } catch (error) {
      console.error('[useQzTray] Connection failed:', error)
      setStatus('error')
      setLastError(error instanceof Error ? error.message : 'Failed to connect to QZ Tray')
    }
  }, [preferences.selectedPrinterName, setStatus, setLastError, setPrinters, setSelectedPrinter])

  /**
   * Disconnect from QZ Tray
   */
  const disconnect = useCallback(async () => {
    const client = getQzTrayClient()

    try {
      await client.disconnect()
    } catch (error) {
      console.error('[useQzTray] Disconnect failed:', error)
    }

    setStatus('disconnected')
    setPrinters([])
  }, [setStatus, setPrinters])

  /**
   * Refresh the list of available printers
   */
  const refreshPrinters = useCallback(async () => {
    const client = getQzTrayClient()

    if (!client.isConnected()) {
      return
    }

    try {
      const availablePrinters = await client.getPrinters()
      setPrinters(availablePrinters)
    } catch (error) {
      console.error('[useQzTray] Failed to refresh printers:', error)
    }
  }, [setPrinters])

  /**
   * Select a printer
   */
  const selectPrinter = useCallback(
    (printerName: string | null) => {
      setSelectedPrinter(printerName)
    },
    [setSelectedPrinter]
  )

  /**
   * Print a test page
   */
  const printTest = useCallback(async () => {
    const client = getQzTrayClient()
    const printerName = preferences.selectedPrinterName

    if (!client.isConnected() || !printerName) {
      throw new Error('Not connected or no printer selected')
    }

    // Print a simple test HTML
    await client.printHtml(
      printerName,
      `
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 20px;">
          <h2>QZ Tray Test Print</h2>
          <p>Printer: ${printerName}</p>
          <p>Date: ${new Date().toLocaleString('pt-BR')}</p>
          <p style="color: green;">Connection successful!</p>
        </body>
      </html>
    `
    )
  }, [preferences.selectedPrinterName])

  // Set up connection closed callback
  useEffect(() => {
    const client = getQzTrayClient()

    const handleClosed = () => {
      setStatus('disconnected')

      // Auto-reconnect if enabled
      if (isEnabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000)

        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      }
    }

    const handleError = (error: Error) => {
      console.error('[useQzTray] Connection error:', error)
      setLastError(error.message)
      setStatus('error')
    }

    const unsubscribeClosed = client.onClosed(handleClosed)
    const unsubscribeError = client.onError(handleError)

    return () => {
      unsubscribeClosed()
      unsubscribeError()
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [isEnabled, connect, setStatus, setLastError])

  // Auto-connect when enabled, or sync status if already connected
  useEffect(() => {
    const client = getQzTrayClient()

    if (isEnabled && !client.isConnected() && status === 'disconnected') {
      // Not connected, try to connect
      connect()
    } else if (isEnabled && client.isConnected() && status !== 'connected') {
      // Already connected (e.g., from modal), sync status
      setStatus('connected')
      // Also refresh printers if needed
      if (printers.length === 0) {
        refreshPrinters()
      }
    } else if (!isEnabled && client.isConnected()) {
      // Disabled but still connected, disconnect
      disconnect()
    }
  }, [isEnabled, status, printers.length, connect, disconnect, setStatus, refreshPrinters])

  return {
    // Status
    status,
    isConnected,
    isEnabled,
    lastError,

    // Printers
    printers,
    selectedPrinter: preferences.selectedPrinterName,
    autoPrint: preferences.autoPrint,

    // Actions
    connect,
    disconnect,
    refreshPrinters,
    selectPrinter,
    printTest,

    // Settings
    setEnabled,
    setAutoPrint,
  }
}
