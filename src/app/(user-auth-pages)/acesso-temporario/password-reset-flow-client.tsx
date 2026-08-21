'use client'

import {
  completeStoreUserPasswordReset,
  markStoreUserPasswordResetLinkConsumed,
} from '@/features/store-users/api'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { Input } from '@/shared/input'
import { useSignIn } from '@clerk/nextjs'
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Step = 'request-code' | 'verify-code' | 'new-password'

export function PasswordResetFlowClient({
  requestId,
  targetEmail,
}: {
  requestId: string
  targetEmail: string
}) {
  const router = useRouter()
  const { isLoaded, setActive, signIn } = useSignIn()
  const [step, setStep] = useState<Step>('request-code')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSendCode = async () => {
    if (!isLoaded || !signIn) return

    setBusy(true)
    setError(null)

    try {
      await markStoreUserPasswordResetLinkConsumed({ requestId })

      const signInAttempt = await signIn.create({
        identifier: targetEmail,
      })

      const resetFactor = signInAttempt.supportedFirstFactors?.find(
        factor => factor.strategy === 'reset_password_email_code'
      )

      if (!resetFactor || !('emailAddressId' in resetFactor)) {
        throw new Error('RESET_EMAIL_FACTOR_NOT_AVAILABLE')
      }

      await signIn.prepareFirstFactor({
        strategy: 'reset_password_email_code',
        emailAddressId: resetFactor.emailAddressId,
      })

      setStep('verify-code')
    } catch {
      setError('Nao foi possivel enviar o codigo. Solicite um novo link.')
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!isLoaded || !signIn) return

    setBusy(true)
    setError(null)

    try {
      await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
      })

      setStep('new-password')
    } catch {
      setError('Codigo invalido ou expirado. Confira o e-mail recebido.')
    } finally {
      setBusy(false)
    }
  }

  const handleSubmitPassword = async () => {
    if (!isLoaded || !signIn) return

    setBusy(true)
    setError(null)

    try {
      const result = await signIn.resetPassword({
        password,
        signOutOfOtherSessions: true,
      })

      if (!result.createdSessionId) throw new Error('RESET_PASSWORD_FAILED')

      await setActive({ session: result.createdSessionId })

      await completeStoreUserPasswordReset({ requestId })
      router.replace('/dashboard')
    } catch {
      setError('Nao foi possivel definir a nova senha. Revise os dados.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="w-full max-w-lg rounded-lg border-border bg-card shadow-sm">
      <CardHeader className="items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-6" />
        </span>
        <CardTitle className="text-2xl">Recuperar acesso</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Este fluxo envia um codigo de seguranca para{' '}
          <strong className="text-foreground">{targetEmail}</strong>. A loja
          nao visualiza sua senha nem o codigo recebido.
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {step === 'request-code' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <Mail className="mt-0.5 size-4 text-primary" />
              <span>
                Clique para receber o codigo de redefinicao no e-mail da conta.
              </span>
            </div>
            <Button className="w-full" isLoading={busy} onClick={handleSendCode}>
              Enviar codigo por e-mail
            </Button>
          </div>
        )}

        {step === 'verify-code' && (
          <div className="space-y-4">
            <label className="grid gap-1 text-sm font-medium">
              Codigo recebido
              <Input
                inputMode="numeric"
                value={code}
                onChange={event => setCode(event.target.value)}
                placeholder="Ex.: 424242"
              />
            </label>
            <Button
              className="w-full"
              disabled={code.trim().length < 4}
              isLoading={busy}
              onClick={handleVerifyCode}
            >
              Validar codigo
            </Button>
          </div>
        )}

        {step === 'new-password' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 size-4" />
              <span>Codigo validado. Defina uma nova senha para continuar.</span>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Nova senha
              <Input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Digite uma senha segura"
              />
            </label>
            <Button
              className="w-full"
              disabled={password.length < 8}
              isLoading={busy}
              onClick={handleSubmitPassword}
            >
              <KeyRound className="size-4" aria-hidden="true" />
              Definir nova senha
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
