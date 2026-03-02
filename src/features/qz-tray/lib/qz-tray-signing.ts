'use server'

import crypto from 'crypto'

/**
 * Server-side QZ Tray signing.
 *
 * The private key is kept secure on the server. Users only need to:
 * 1. Download the certificate from /qz-tray/certificate.txt
 * 2. Import it into their QZ Tray (one-time setup)
 *
 * After that, all print requests are signed server-side and work silently.
 */

/**
 * Check if QZ Tray signing is configured.
 * Returns true if the private key environment variable is set.
 */
export async function isSigningConfigured(): Promise<boolean> {
  return !!process.env.QZ_TRAY_PRIVATE_KEY
}

/**
 * Sign a QZ Tray message using the server's private key.
 *
 * @param message - The message to sign (provided by QZ Tray)
 * @returns Base64-encoded signature, or null if signing is not configured
 */
export async function signQzMessage(message: string): Promise<string | null> {
  const privateKey = process.env.QZ_TRAY_PRIVATE_KEY

  if (!privateKey) {
    return null
  }

  try {
    // The private key in env vars has escaped newlines, convert them back
    const formattedKey = privateKey.replace(/\\n/g, '\n')

    const sign = crypto.createSign('SHA512')
    sign.update(message)
    return sign.sign(formattedKey, 'base64')
  } catch (error) {
    console.error('[QzTraySigning] Failed to sign message:', error)
    return null
  }
}
