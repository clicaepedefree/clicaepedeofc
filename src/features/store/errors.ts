export type PermissionsErrorType = 'FORBIDDEN' | 'USER_CONFLICT'

export const permissionTypeToErrorCodeMapping = {
  FORBIDDEN: '401:',
  USER_CONFLICT: '409U:',
}

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
