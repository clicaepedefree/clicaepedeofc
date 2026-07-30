import type { DigitalMenuSubmissionResult } from './types'

export class DigitalMenuOrderDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DigitalMenuOrderDomainError'
  }
}

export const getDigitalMenuOrderDomainFailure = (
  error: unknown
): Extract<DigitalMenuSubmissionResult, { ok: false }> | null => {
  if (!(error instanceof DigitalMenuOrderDomainError)) return null

  return {
    ok: false,
    code: 'SUBMISSION_FAILED',
    message: error.message,
  }
}
