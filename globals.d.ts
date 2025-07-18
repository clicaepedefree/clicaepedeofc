declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      onboardingComplete?: boolean
      userId?: string
    }
  }
  module '*.receipt' {
    const content: string
    export default content
  }
}

export {}
