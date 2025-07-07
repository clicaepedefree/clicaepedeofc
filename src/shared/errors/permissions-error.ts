export const permissionTypeToErrorCodeMapping = {
  FORBIDDEN: '401P:',
  USER_CONFLICT: '409P:',
}

export type PermissionsErrorType = keyof typeof permissionTypeToErrorCodeMapping

export class PermissionsError extends Error {
  type: PermissionsErrorType

  constructor({
    type,
    message,
  }: {
    type: PermissionsErrorType
    message?: string
  }) {
    const permissionErrorCode = permissionTypeToErrorCodeMapping[type]
    const errorMessage = message ?? 'Erro'
    const permissionErrorMessage = `${permissionErrorCode} ${errorMessage}`

    super(permissionErrorMessage)
    this.type = type
  }
}

export const isPermissionsError = (error: Error): error is PermissionsError => {
  if (error instanceof PermissionsError) return true

  const errorCodes = Object.values(permissionTypeToErrorCodeMapping)

  if (errorCodes.some(errorCode => error?.message?.includes(errorCode)))
    return true

  return false
}
