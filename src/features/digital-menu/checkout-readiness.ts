export type DigitalMenuCheckoutReadinessInput = {
  isOpenNow: boolean
  allowScheduledOrders: boolean
  canSchedule: boolean
  hasScheduledFor: boolean
  hasValidScheduledDate: boolean
  orderTypeEnabled: boolean
  isAddressCovered: boolean
  missingMinimumAmount: number
  hasSelectedPaymentMethod: boolean
  hasFieldErrors: boolean
  remainingSeconds: number
  isCaptchaRequired: boolean
  hasCaptchaToken: boolean
}

export const canValidateDigitalMenuCheckout = ({
  isOpenNow,
  allowScheduledOrders,
  canSchedule,
  hasScheduledFor,
  hasValidScheduledDate,
  orderTypeEnabled,
  isAddressCovered,
  missingMinimumAmount,
}: DigitalMenuCheckoutReadinessInput) => {
  const canCheckoutScheduled =
    allowScheduledOrders &&
    canSchedule &&
    hasScheduledFor &&
    hasValidScheduledDate

  return (
    (isOpenNow || canCheckoutScheduled) &&
    orderTypeEnabled &&
    isAddressCovered &&
    missingMinimumAmount === 0
  )
}

export const canSubmitDigitalMenuCheckout = (
  input: DigitalMenuCheckoutReadinessInput
) =>
  canValidateDigitalMenuCheckout(input) &&
  input.hasSelectedPaymentMethod &&
  !input.hasFieldErrors &&
  input.remainingSeconds === 0 &&
  (!input.isCaptchaRequired || input.hasCaptchaToken)
