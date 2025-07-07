export const useCaseErrorTypeToErrorCodeMapping = {
  IMMUTABLE_STATE: '1UC:',
}

export type UseCaseErrorType = keyof typeof useCaseErrorTypeToErrorCodeMapping

export class UseCaseError extends Error {
  type: UseCaseErrorType

  constructor({ type, message }: { type: UseCaseErrorType; message?: string }) {
    const useCaseErrorCode = useCaseErrorTypeToErrorCodeMapping[type]
    const errorMessage = message ?? 'Erro'
    const useCaseErrorMessage = `${useCaseErrorCode} ${errorMessage}`

    super(useCaseErrorMessage)
    this.type = type
  }
}

export const isUseCaseError = (error: Error): error is UseCaseError => {
  if (error instanceof UseCaseError) return true

  const errorCodes = Object.values(useCaseErrorTypeToErrorCodeMapping)

  if (errorCodes.some(errorCode => error?.message?.includes(errorCode)))
    return true

  return false
}
