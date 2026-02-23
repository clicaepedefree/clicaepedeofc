import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.IFOOD_TOKEN_ENCRYPTION_KEY

if (!ENCRYPTION_KEY) {
  throw new Error('IFOOD_TOKEN_ENCRYPTION_KEY environment variable is required')
}

// Ensure the key is 32 bytes (64 hex characters)
if (ENCRYPTION_KEY.length !== 64) {
  throw new Error(
    'IFOOD_TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 characters). Generate with: openssl rand -hex 32'
  )
}

const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'hex')
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // AES-GCM standard IV length
const AUTH_TAG_LENGTH = 16 // AES-GCM standard auth tag length

/**
 * Encrypts a string using AES-256-GCM
 * @param text - Plain text to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all hex-encoded)
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv)

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:encryptedData (all hex-encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypts a string encrypted with encrypt()
 * @param encryptedText - Encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format')
  }

  const [ivHex, authTagHex, encrypted] = parts

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
