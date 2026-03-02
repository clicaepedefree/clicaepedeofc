'use client'

import { OrderTemplate, OrderTemplateInput } from '@/features/receipt/templates/order'
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
 * Test order data for QZ Tray test print.
 * Uses realistic, complex data to validate the full receipt rendering pipeline.
 */
const TEST_ORDER: OrderTemplateInput = {
  storeName: 'Restaurante Exemplo',
  displayId: 'TESTE-001',
  createdAt: new Date(),
  orderType: 'DINE_IN',
  posCounterName: 'Caixa 01',
  items: [
    {
      itemName: 'X-Tudo Especial',
      quantity: 2,
      unitPrice: 32.9,
      totalPrice: 65.8,
      options: [
        { optionName: 'Queijo Extra', optionQuantity: 2, optionPrice: 4.0 },
        { optionName: 'Bacon Crocante', optionQuantity: 1, optionPrice: 6.0 },
      ],
      comment: 'Sem cebola, ponto da carne bem passado',
    },
    {
      itemName: 'Batata Frita Grande',
      quantity: 1,
      unitPrice: 18.0,
      totalPrice: 18.0,
      options: [{ optionName: 'Cheddar e Bacon', optionQuantity: 1, optionPrice: 8.0 }],
    },
    {
      itemName: 'Refrigerante Lata 350ml',
      quantity: 3,
      unitPrice: 6.0,
      totalPrice: 18.0,
    },
    {
      itemName: 'Milk Shake Chocolate 500ml',
      quantity: 1,
      unitPrice: 16.0,
      totalPrice: 16.0,
      comment: 'Com chantilly',
    },
  ],
  subtotal: 135.8,
  discount: 10.0,
  totalPrice: 125.8,
  payments: [
    { method: 'CASH', value: 75.8, changeFor: 100.0 },
    { method: 'CREDIT_CARD', value: 50.0 },
  ],
  customerName: 'Joao da Silva',
  customerPhone: '(11) 99999-8888',
  customerAddress: 'Rua das Flores, 123 - Centro',
}

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

      img.onerror = e => {
        console.error('[svgToPngBase64] Failed to load SVG', e)
        reject(new Error('Failed to load SVG image'))
      }

      // Load SVG as data URL
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
  }, [])

  /**
   * Print a test page using a realistic order receipt.
   * Uses the OrderTemplate to generate a full receipt with test data.
   */
  const printTest = useCallback(async () => {
    const client = getQzTrayClient()
    const printerName = preferences.selectedPrinterName

    if (!printerName) {
      throw new Error('No printer selected')
    }

    // Ensure connection is active
    if (!client.isConnected()) {
      console.log('[printTest] Not connected, attempting to reconnect...')
      try {
        await client.connect()
      } catch (connectError) {
        throw new Error('Failed to connect to QZ Tray. Please check if QZ Tray is running.')
      }
    }

    try {
      // Generate receipt SVG using OrderTemplate with test data
      // Update the timestamp to current time for each test print
      const testOrderWithCurrentTime = {
        ...TEST_ORDER,
        createdAt: new Date(),
      }
      const receiptSvg = await OrderTemplate.render(testOrderWithCurrentTime)

      // Convert SVG to PNG base64 for QZ Tray
      const base64 = await svgToPngBase64(receiptSvg)

      console.log('[printTest] Sending test receipt', { base64Length: base64.length })
      await client.printImage(printerName, base64)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Print failed'
      console.error('[printTest] Error:', errorMessage)
      if (errorMessage.includes('Connection closed')) {
        throw new Error(
          'QZ Tray rejected the request. Please whitelist localhost in QZ Tray Site Manager (Right-click QZ Tray → Advanced → Site Manager).'
        )
      }
      throw error
    }
  }, [preferences.selectedPrinterName, svgToPngBase64])

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
