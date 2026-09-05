import { describe, expect, test } from 'bun:test'

import {
  getWhatsappConnectionActions,
  getWhatsappConnectionGuidance,
  getWhatsappConnectionStatusLabel,
  getWhatsappPollingInterval,
  sanitizeWhatsappConnectionError,
  shouldShowWhatsappQrCode,
} from './connection-panel-policy'

describe('whatsapp connection panel policy', () => {
  test('maps operational actions by session status', () => {
    expect(getWhatsappConnectionActions(null)).toEqual(['connect'])
    expect(getWhatsappConnectionActions('pending_qr')).toEqual([
      'view_qr',
      'renew_qr',
      'pause',
      'disconnect',
    ])
    expect(getWhatsappConnectionActions('connected')).toEqual([
      'pause',
      'disconnect',
    ])
    expect(getWhatsappConnectionActions('paused')).toEqual([
      'resume',
      'disconnect',
    ])
    expect(getWhatsappConnectionActions('error')).toEqual([
      'renew_qr',
      'disconnect',
    ])
  })

  test('shows qr code only while pending and not expired', () => {
    expect(
      shouldShowWhatsappQrCode({
        status: 'pending_qr',
        qrCodeBase64: 'base64',
        qrCodeExpiresAt: new Date(Date.now() + 60_000),
      })
    ).toBe(true)

    expect(
      shouldShowWhatsappQrCode({
        status: 'pending_qr',
        qrCodeBase64: 'base64',
        qrCodeExpiresAt: new Date(Date.now() - 60_000),
      })
    ).toBe(false)

    expect(
      shouldShowWhatsappQrCode({
        status: 'connected',
        qrCodeBase64: 'base64',
        qrCodeExpiresAt: new Date(Date.now() + 60_000),
      })
    ).toBe(false)
  })

  test('uses live polling only for statuses that can change externally', () => {
    expect(getWhatsappPollingInterval('connecting')).toBe(3000)
    expect(getWhatsappPollingInterval('pending_qr')).toBe(5000)
    expect(getWhatsappPollingInterval('connected')).toBe(30000)
    expect(getWhatsappPollingInterval('paused')).toBe(false)
    expect(getWhatsappPollingInterval('disconnected')).toBe(false)
  })

  test('sanitizes credentials and returns actionable errors', () => {
    expect(
      sanitizeWhatsappConnectionError(
        'Unauthorized apikey=super-secret-token Bearer other-secret'
      )
    ).toBe('Voce nao tem permissao para alterar esta conexao.')

    expect(sanitizeWhatsappConnectionError('QR code expired')).toBe(
      'Este QR Code expirou. Gere um novo codigo para conectar.'
    )

    expect(sanitizeWhatsappConnectionError('fetch timeout')).toBe(
      'Nao foi possivel falar com o WhatsApp agora. Tente novamente em instantes.'
    )
  })

  test('keeps paused state guidance clear about preserved settings', () => {
    expect(getWhatsappConnectionStatusLabel('paused')).toBe('Pausado')
    expect(
      getWhatsappConnectionGuidance({
        status: 'paused',
      })
    ).toContain('configuracoes foram preservados')
  })
})
