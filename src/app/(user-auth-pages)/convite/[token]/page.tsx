import { acceptStoreAccessInviteAction } from '@/features/store-access-invites/actions'
import { getStoreAccessInvitePreview } from '@/features/store-access-invites/db'
import { normalizeUserEmail } from '@/features/user/user-policy'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { currentUser } from '@clerk/nextjs/server'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Store,
} from 'lucide-react'
import Link from 'next/link'

type PageProps = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}

const statusCopy = {
  invalid: {
    title: 'Convite invalido',
    description:
      'Nao encontramos um convite ativo para este link. Peça um novo convite ao suporte da Clica e Pede.',
  },
  malformed: {
    title: 'Convite invalido',
    description:
      'O link informado nao parece ser um convite valido. Copie o link completo e tente novamente.',
  },
  expired: {
    title: 'Convite expirado',
    description:
      'Este convite passou do prazo de seguranca. Peça para a equipe reenviar um novo acesso.',
  },
  used: {
    title: 'Convite ja utilizado',
    description:
      'Este convite ja foi usado para ativar um acesso. Entre no painel com a conta vinculada.',
  },
  revoked: {
    title: 'Convite substituido',
    description:
      'Este convite foi cancelado por um reenvio mais recente. Use o ultimo link recebido.',
  },
}

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

export default async function StoreAccessInvitePage({
  params,
  searchParams,
}: PageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams])
  const [invite, clerkUser] = await Promise.all([
    getStoreAccessInvitePreview(token),
    currentUser(),
  ])

  if (invite.status !== 'valid') {
    const copy = statusCopy[invite.status]

    return (
      <Card className="w-full max-w-lg rounded-lg border-border bg-card shadow-sm">
        <CardHeader className="items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </span>
          <CardTitle className="text-2xl">{copy.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.description}
          </p>
          <Button asChild>
            <Link href="/login">Entrar no painel</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const invitedEmail = normalizeUserEmail(invite.targetEmail)
  const currentEmail = clerkUser?.emailAddresses.find(
    emailAddress => emailAddress.id === clerkUser.primaryEmailAddressId
  )?.emailAddress
  const currentNormalizedEmail = currentEmail
    ? normalizeUserEmail(currentEmail)
    : null
  const isLoggedWithExpectedEmail = currentNormalizedEmail === invitedEmail
  const loginHref = `/login?redirect_url=${encodeURIComponent(`/convite/${token}`)}`

  return (
    <Card className="w-full max-w-xl overflow-hidden rounded-lg border-border bg-card shadow-sm">
      <CardHeader className="border-b bg-muted/40">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-primary">Convite seguro</p>
            <CardTitle className="text-2xl">Ative seu acesso</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        {query.error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Nao foi possivel aceitar este convite. Confira se voce esta usando o
            e-mail correto.
          </div>
        )}

        <div className="rounded-lg border bg-background p-4">
          <div className="flex items-start gap-3">
            <Store className="mt-0.5 size-5 text-primary" />
            <div>
              <p className="font-semibold text-foreground">
                {invite.storeName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Este convite libera acesso administrativo para {invitedEmail}.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="size-4" />
            Expira em {formatDateTime(invite.expiresAt)}
          </div>
        </div>

        {!clerkUser ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Entre ou crie sua conta usando o e-mail convidado. A senha sera
              definida por voce no ambiente seguro do Clerk.
            </p>
            <Button asChild className="w-full">
              <Link href={loginHref}>Entrar ou criar conta</Link>
            </Button>
          </div>
        ) : isLoggedWithExpectedEmail ? (
          <form action={acceptStoreAccessInviteAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4" />
                <span>
                  Voce esta autenticado com o e-mail correto. Confirme para
                  vincular esta conta a loja.
                </span>
              </div>
            </div>
            <Button type="submit" className="w-full">
              Ativar acesso
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
              Este convite e para {invitedEmail}, mas voce esta conectado como{' '}
              {currentNormalizedEmail ?? 'outro usuario'}. Saia e entre com o
              e-mail correto para continuar.
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href={loginHref}>Entrar com outro e-mail</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
