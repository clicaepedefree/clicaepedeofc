declare module 'qz-tray' {
  export interface ConnectOptions {
    host?: string | string[]
    usingSecure?: boolean
    keepAlive?: number
    retries?: number
    delay?: number
  }

  export interface PrinterConfigOptions {
    colorType?: 'color' | 'grayscale' | 'blackwhite'
    copies?: number
    density?: number
    duplex?: boolean
    fallbackDensity?: number
    interpolation?: 'bicubic' | 'bilinear' | 'nearest-neighbor'
    jobName?: string
    legacy?: boolean
    margins?: number | { top?: number; right?: number; bottom?: number; left?: number }
    orientation?: 'portrait' | 'landscape' | 'reverse-portrait' | 'reverse-landscape'
    paperThickness?: number
    printerTray?: string
    rasterize?: boolean
    rotation?: number
    scaleContent?: boolean
    size?: { width?: number; height?: number }
    units?: 'in' | 'cm' | 'mm'
    altPrinting?: boolean
    encoding?: string
    endOfDoc?: string
    perSpool?: number
  }

  export interface PrinterConfig {
    getPrinter(): string
    getOptions(): PrinterConfigOptions
    reconfigure(options: PrinterConfigOptions): void
  }

  export interface PrintDataOptions {
    language?: string
    x?: number
    y?: number
    dotDensity?: 'single' | 'double' | 'triple'
    xmlTag?: string
    pageWidth?: number
    pageHeight?: number
  }

  export interface PrintData {
    type: 'raw' | 'file' | 'image' | 'html' | 'pdf' | 'pixel'
    format?: string
    flavor?: 'plain' | 'base64' | 'file' | 'hex'
    data: string | string[]
    options?: PrintDataOptions
  }

  export const websocket: {
    /**
     * Establishes a WebSocket connection to QZ Tray.
     */
    connect(options?: ConnectOptions): Promise<void>

    /**
     * Disconnects from QZ Tray.
     */
    disconnect(): Promise<void>

    /**
     * Returns whether there is an active connection to QZ Tray.
     */
    isActive(): boolean

    /**
     * Gets connection information.
     */
    getConnectionInfo(): { socket: string; host: string; port: number }

    /**
     * Sets callback functions for when the connection is closed.
     */
    setClosedCallbacks(callback: ((event: CloseEvent) => void) | ((event: CloseEvent) => void)[]): void

    /**
     * Sets callback functions for connection errors.
     */
    setErrorCallbacks(callback: ((error: Error) => void) | ((error: Error) => void)[]): void
  }

  export const printers: {
    /**
     * Finds printers matching the search criteria.
     * Without parameters, returns all available printers.
     */
    find(query?: string): Promise<string | string[]>

    /**
     * Gets the system default printer.
     */
    getDefault(): Promise<string>
  }

  export const configs: {
    /**
     * Creates a printer configuration object.
     */
    create(printer: string | null, options?: PrinterConfigOptions): PrinterConfig
  }

  /**
   * Sends print data to a printer.
   */
  export function print(config: PrinterConfig, data: (string | PrintData)[]): Promise<void>

  export const security: {
    /**
     * Sets the certificate promise for signed connections.
     * The promise receives a resolve callback to return the certificate content.
     */
    setCertificatePromise(promise: (resolve: (cert: string) => void) => void): void

    /**
     * Sets the signature promise for message signing.
     * Called for each print/function call to get a base64 signature.
     */
    setSignaturePromise(
      promise: (
        toSign: string
      ) => (resolve: (signature: string) => void, reject: (error: Error) => void) => void
    ): void

    /**
     * Sets the signature algorithm (e.g., "SHA512").
     * Must match the algorithm used when signing.
     */
    setSignatureAlgorithm(algorithm: 'SHA1' | 'SHA256' | 'SHA512'): void
  }

  export const api: {
    /**
     * Shows the QZ Tray message log.
     */
    showDebug(): void

    /**
     * Gets the version of QZ Tray.
     */
    getVersion(): Promise<string>

    /**
     * Checks if WebSocket is supported.
     */
    isWebSocketSupported(): boolean
  }
}
