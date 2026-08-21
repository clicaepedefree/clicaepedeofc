import { getStoreUserPasswordResetRequestPreview } from '@/features/store-users/api'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { PasswordResetFlowClient } from './password-reset-flow-client'

type PageProps = {
  searchParams: Promise<{
    request?: string
  }>
}

export default async function TemporaryAccessPage({ searchParams }: PageProps) {
  const params = await searchParams

  if (!params.request) {
    return (
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-foreground">
          Link incompleto
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Copie o link temporario completo e tente novamente.
        </p>
      </div>
    )
  }

  const preview = await getStoreUserPasswordResetRequestPreview(params.request)

  if (preview.status !== 'valid') {
    const title =
      preview.status === 'completed'
        ? 'Recuperacao ja concluida'
        : preview.status === 'expired'
          ? 'Link expirado'
          : preview.status === 'revoked'
            ? 'Link substituido'
            : preview.status === 'consumed'
              ? 'Link ja utilizado'
              : 'Link invalido'

    return (
      <Card className="w-full max-w-lg rounded-lg border-border bg-card shadow-sm">
        <CardHeader className="items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </span>
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <p className="text-sm leading-6 text-muted-foreground">
            Solicite um novo link para a equipe da loja. Por seguranca, links
            antigos nao podem ser reutilizados.
          </p>
          <Button asChild>
            <Link href="/login">Entrar no painel</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <PasswordResetFlowClient
      requestId={params.request}
      targetEmail={preview.targetEmail}
    />
  )
}
