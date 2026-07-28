import { describe, expect, test } from 'bun:test'
import {
  canSubmitDigitalMenuCheckout,
  canValidateDigitalMenuCheckout,
  type DigitalMenuCheckoutReadinessInput,
} from './checkout-readiness'

const baseReadiness: DigitalMenuCheckoutReadinessInput = {
  isOpenNow: false,
  allowScheduledOrders: true,
  canSchedule: true,
  hasScheduledFor: true,
  hasValidScheduledDate: true,
  orderTypeEnabled: true,
  isAddressCovered: true,
  missingMinimumAmount: 0,
  hasSelectedPaymentMethod: true,
  hasFieldErrors: false,
  remainingSeconds: 0,
  isCaptchaRequired: false,
  hasCaptchaToken: false,
}

describe('digital menu checkout readiness', () => {
  test('permite envio de pedido agendado valido fora do horario atual', () => {
    expect(canValidateDigitalMenuCheckout(baseReadiness)).toBe(true)
    expect(canSubmitDigitalMenuCheckout(baseReadiness)).toBe(true)
  })

  test('mantem botao validavel, mas bloqueia envio sem pagamento selecionado', () => {
    const readiness = {
      ...baseReadiness,
      hasSelectedPaymentMethod: false,
    }

    expect(canValidateDigitalMenuCheckout(readiness)).toBe(true)
    expect(canSubmitDigitalMenuCheckout(readiness)).toBe(false)
  })

  test('mantem botao validavel enquanto verificacao antiabuso aguarda token', () => {
    const readiness = {
      ...baseReadiness,
      isCaptchaRequired: true,
      hasCaptchaToken: false,
    }

    expect(canValidateDigitalMenuCheckout(readiness)).toBe(true)
    expect(canSubmitDigitalMenuCheckout(readiness)).toBe(false)
  })

  test('bloqueia quando a loja esta fechada e nao ha agendamento valido', () => {
    const readiness = {
      ...baseReadiness,
      hasScheduledFor: false,
      hasValidScheduledDate: false,
    }

    expect(canValidateDigitalMenuCheckout(readiness)).toBe(false)
    expect(canSubmitDigitalMenuCheckout(readiness)).toBe(false)
  })
})
