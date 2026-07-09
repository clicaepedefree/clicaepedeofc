import { describe, expect, test } from 'bun:test'
import {
  getPublicOrderProgressStatuses,
  getPublicOrderStatusCopy,
  publicStageStatus,
} from './order-status-copy'

describe('public order status copy', () => {
  test('normalizes intermediate queue statuses for customer tracking', () => {
    expect(publicStageStatus('CREATED')).toBe('PENDING')
    expect(publicStageStatus('SENT_TO_STORE')).toBe('PENDING')
    expect(publicStageStatus('IN_PREPARATION')).toBe('IN_PREPARATION')
  })

  test('uses delivery-specific status messages', () => {
    expect(getPublicOrderStatusCopy('OUT_FOR_DELIVERY', 'DELIVERY')).toEqual({
      title: 'Saiu para entrega',
      message: 'Seu pedido saiu da loja e esta a caminho.',
    })
  })

  test('uses takeout-specific status messages', () => {
    expect(getPublicOrderStatusCopy('READY', 'TAKEOUT')).toEqual({
      title: 'Pronto para retirada',
      message: 'Seu pedido esta pronto para retirada no balcao.',
    })
  })

  test('uses delivery-specific status titles when the same status has a different meaning', () => {
    expect(getPublicOrderStatusCopy('READY', 'DELIVERY')).toEqual({
      title: 'Pronto para entrega',
      message: 'Seu pedido esta pronto para sair para entrega.',
    })
  })

  test('removes delivery-only step from takeout timeline', () => {
    expect(
      getPublicOrderProgressStatuses('TAKEOUT').includes('OUT_FOR_DELIVERY')
    ).toBe(false)
    expect(
      getPublicOrderProgressStatuses('DELIVERY').includes('OUT_FOR_DELIVERY')
    ).toBe(true)
  })
})
