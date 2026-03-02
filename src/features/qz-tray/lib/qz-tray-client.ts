import type { PrinterConfig, PrintData } from 'qz-tray'
import { isSigningConfigured, signQzMessage } from './qz-tray-signing'

/**
 * Singleton wrapper for QZ Tray operations.
 * Handles connection, printer discovery, and printing.
 *
 * Note: QZ Tray must be dynamically imported because it requires
 * the window object (browser-only).
 */
class QzTrayClient {
  private static instance: QzTrayClient | null = null
  private qz: typeof import('qz-tray') | null = null
  private initialized = false
  private signingConfigured = false
  private closedCallbacks: Array<() => void> = []
  private errorCallbacks: Array<(error: Error) => void> = []

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): QzTrayClient {
    if (!QzTrayClient.instance) {
      QzTrayClient.instance = new QzTrayClient()
    }
    return QzTrayClient.instance
  }

  /**
   * Initialize the QZ Tray library (lazy load)
   * Must be called before any other operations
   */
  async initialize(): Promise<boolean> {
    if (this.initialized && this.qz) {
      return true
    }

    // Only run in browser
    if (typeof window === 'undefined') {
      console.warn('[QzTrayClient] Cannot initialize in non-browser environment')
      return false
    }

    try {
      this.qz = await import('qz-tray')

      // Configure signing for silent printing (no confirmation dialogs)
      // Must complete BEFORE connecting to avoid race conditions
      await this.configureSigning()

      // Set up callbacks
      this.qz.websocket.setClosedCallbacks(() => {
        this.closedCallbacks.forEach(cb => cb())
      })

      this.qz.websocket.setErrorCallbacks((error: Error) => {
        this.errorCallbacks.forEach(cb => cb(error))
      })

      this.initialized = true
      return true
    } catch (error) {
      console.error('[QzTrayClient] Failed to initialize:', error)
      return false
    }
  }

  /**
   * Configure certificate and signature promises for silent printing.
   *
   * This enables printing without user confirmation dialogs by using
   * a self-signed certificate generated via QZ Tray > Advanced > Site Manager.
   *
   * The certificate is public and served from /qz-tray-certificate.txt
   * The private key is kept secure on the server and used via Server Action.
   *
   * If signing is not configured, QZ Tray will show confirmation dialogs.
   */
  private async configureSigning(): Promise<void> {
    if (!this.qz || this.signingConfigured) return

    // Check if signing is configured on the server
    const signingAvailable = await isSigningConfigured()

    if (!signingAvailable) {
      console.log(
        '[QzTrayClient] Signing not configured. QZ Tray will show confirmation dialogs. ' +
          'To enable silent printing, generate certificates via QZ Tray > Advanced > Site Manager.'
      )
      this.signingConfigured = true // Mark as configured (even though disabled) to avoid retry
      return
    }

    // Set certificate promise - fetches the public certificate
    this.qz.security.setCertificatePromise(resolve => {
      fetch('/qz-tray/certificate.txt', { cache: 'no-store' })
        .then(response => {
          if (!response.ok) {
            console.warn(
              '[QzTrayClient] Certificate not found at /qz-tray/certificate.txt. ' +
                'Silent printing disabled.'
            )
            resolve('') // Empty certificate = signing disabled
            return
          }
          return response.text()
        })
        .then(cert => {
          if (cert) resolve(cert)
        })
        .catch(error => {
          console.warn('[QzTrayClient] Failed to load certificate:', error)
          resolve('')
        })
    })

    // Set signature promise - calls server action to sign with private key
    this.qz.security.setSignaturePromise(toSign => {
      return (resolve, reject) => {
        signQzMessage(toSign)
          .then(signature => {
            if (signature) {
              resolve(signature)
            } else {
              // Signing returned null - not configured
              reject(new Error('Signing not configured'))
            }
          })
          .catch(error => {
            console.warn('[QzTrayClient] Signing failed:', error)
            reject(error)
          })
      }
    })

    this.signingConfigured = true
    console.log('[QzTrayClient] Signing configured for silent printing')
  }

  /**
   * Check if the QZ Tray library is available
   */
  isAvailable(): boolean {
    return this.initialized && this.qz !== null
  }

  /**
   * Check if currently connected to QZ Tray
   */
  isConnected(): boolean {
    if (!this.qz) return false
    return this.qz.websocket.isActive()
  }

  /**
   * Connect to QZ Tray
   */
  async connect(): Promise<void> {
    if (!this.qz) {
      const initialized = await this.initialize()
      if (!initialized) {
        throw new Error('QZ Tray is not available')
      }
    }

    if (this.isConnected()) {
      return // Already connected
    }

    await this.qz!.websocket.connect({
      retries: 3,
      delay: 1,
    })
  }

  /**
   * Disconnect from QZ Tray
   */
  async disconnect(): Promise<void> {
    if (!this.qz || !this.isConnected()) {
      return
    }

    await this.qz.websocket.disconnect()
  }

  /**
   * Get list of available printers
   */
  async getPrinters(): Promise<string[]> {
    if (!this.qz || !this.isConnected()) {
      throw new Error('Not connected to QZ Tray')
    }

    const result = await this.qz.printers.find()

    // find() returns a single string if one printer, array if multiple
    if (typeof result === 'string') {
      return [result]
    }

    return result
  }

  /**
   * Get the system default printer
   */
  async getDefaultPrinter(): Promise<string | null> {
    if (!this.qz || !this.isConnected()) {
      return null
    }

    try {
      return await this.qz.printers.getDefault()
    } catch {
      return null
    }
  }

  /**
   * Find a specific printer by name
   */
  async findPrinter(name: string): Promise<string | null> {
    if (!this.qz || !this.isConnected()) {
      return null
    }

    try {
      const result = await this.qz.printers.find(name)
      return typeof result === 'string' ? result : result[0] || null
    } catch {
      return null
    }
  }

  /**
   * Print an image (SVG, PNG, etc.)
   * Used for receipt printing since receipts are SVG-based
   */
  async printImage(printerName: string, imageData: string): Promise<void> {
    if (!this.qz || !this.isConnected()) {
      throw new Error('Not connected to QZ Tray')
    }

    const config: PrinterConfig = this.qz.configs.create(printerName, {
      scaleContent: true,
    })

    const data: PrintData[] = [
      {
        type: 'pixel',
        format: 'image',
        flavor: 'base64',
        data: imageData,
      },
    ]

    await this.qz.print(config, data)
  }

  /**
   * Print raw data (ESC/POS commands)
   * For thermal receipt printers
   */
  async printRaw(printerName: string, rawData: string[]): Promise<void> {
    if (!this.qz || !this.isConnected()) {
      throw new Error('Not connected to QZ Tray')
    }

    const config: PrinterConfig = this.qz.configs.create(printerName)

    await this.qz.print(config, rawData)
  }

  /**
   * Print an HTML document
   */
  async printHtml(printerName: string, html: string): Promise<void> {
    if (!this.qz || !this.isConnected()) {
      throw new Error('Not connected to QZ Tray')
    }

    const config: PrinterConfig = this.qz.configs.create(printerName, {
      scaleContent: true,
    })

    const data: PrintData[] = [
      {
        type: 'pixel',
        format: 'html',
        flavor: 'plain',
        data: html,
      },
    ]

    await this.qz.print(config, data)
  }

  /**
   * Register a callback for connection closed events
   */
  onClosed(callback: () => void): () => void {
    this.closedCallbacks.push(callback)
    return () => {
      const index = this.closedCallbacks.indexOf(callback)
      if (index > -1) {
        this.closedCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Register a callback for connection error events
   */
  onError(callback: (error: Error) => void): () => void {
    this.errorCallbacks.push(callback)
    return () => {
      const index = this.errorCallbacks.indexOf(callback)
      if (index > -1) {
        this.errorCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Get the QZ Tray version
   */
  async getVersion(): Promise<string | null> {
    if (!this.qz || !this.isConnected()) {
      return null
    }

    try {
      return await this.qz.api.getVersion()
    } catch {
      return null
    }
  }
}

/**
 * Get the singleton QZ Tray client instance
 */
export const getQzTrayClient = () => QzTrayClient.getInstance()
