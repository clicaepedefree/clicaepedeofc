export type AuthErrorType = 'NOT_AUTHENTICATED' | 'MISSING_ONBOARDING' | 'UNAUTHORIZED'

export class AuthError extends Error {
  type: AuthErrorType

  constructor({ type, message }: { type: AuthErrorType; message?: string }) {
    super(message ?? type)
    this.type = type
  }
}
