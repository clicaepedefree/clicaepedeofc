'use client'

import { createFirstStoreForCurrentUser } from '@/features/store/api'
import {
  normalizeStoreSubdomain,
  onboardingStoreSchema,
  type OnboardingStoreFormValues,
} from '@/features/store/form-validation/onboarding-store-schema'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { dispatchToast } from '@/shared/lib/toast'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useSetAtom } from 'jotai'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Store,
  WandSparkles,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

type FormErrors = Partial<Record<keyof OnboardingStoreFormValues | 'root', string>>

type RecoverableStore = {
  id: number
  name: string
  subdomain: string
  status: string
}

export function AdminOnboardingForm({
  recoverableStores = [],
}: {
  recoverableStores?: RecoverableStore[]
}) {
  const router = useRouter()
  const setSelectedStoreId = useSetAtom(selectedStoreIdAtom)
  const [isPending, startTransition] = useTransition()
  const [values, setValues] = useState<OnboardingStoreFormValues>({
    name: '',
    subdomain: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [subdomainTouched, setSubdomainTouched] = useState(false)

  const previewUrl = useMemo(() => {
    const subdomain = values.subdomain || 'sua-loja'
    return `${subdomain}.clicapedidos.com.br`
  }, [values.subdomain])

  const updateName = (name: string) => {
    setValues(current => ({
      name,
      subdomain: subdomainTouched
        ? current.subdomain
        : normalizeStoreSubdomain(name),
    }))
  }

  const updateSubdomain = (subdomain: string) => {
    setSubdomainTouched(true)
    setValues(current => ({
      ...current,
      subdomain: normalizeStoreSubdomain(subdomain),
    }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsedValues = onboardingStoreSchema.safeParse(values)

    if (!parsedValues.success) {
      const nextErrors: FormErrors = {}

      for (const issue of parsedValues.error.issues) {
        const field = issue.path[0] as keyof OnboardingStoreFormValues
        nextErrors[field] = issue.message
      }

      setErrors(nextErrors)
      return
    }

    setErrors({})

    startTransition(async () => {
      const result = await createFirstStoreForCurrentUser(parsedValues.data)

      if (!result.success) {
        setErrors({ root: result.error })
        dispatchToast({ message: result.error, type: 'error' })
        return
      }

      setSelectedStoreId(result.storeId)
      dispatchToast({
        message: 'Loja criada. Bem-vindo ao painel!',
        type: 'success',
      })
      router.replace('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="grid min-h-[calc(100dvh-4rem)] w-full place-items-center bg-muted/40 px-4 py-8 dark:bg-background">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg shadow-slate-950/5 dark:shadow-black/25 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden border-r border-white/10 bg-slate-950 p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/10">
              <Store className="h-5 w-5" />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-wider text-emerald-300">
                Primeiro acesso
              </p>
              <h1 className="text-3xl font-semibold leading-tight">
                Vamos criar a base da sua operacao.
              </h1>
              <p className="max-w-sm text-sm leading-6 text-slate-300">
                A loja organiza cardapio, caixa, pedidos, arquivos e permissoes.
                Depois disso voce ja consegue testar o painel com dados reais.
              </p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-slate-300">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Perfil Proprietario criado automaticamente
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Banco de dados e storage ja conectados
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Pronto para cadastrar produtos e testar o POS
            </div>
          </div>
        </aside>

        <section className="bg-card p-6 sm:p-8 lg:p-10">
          <div className="mb-8 flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary dark:border-primary/20 dark:bg-primary/15">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Cadastro da loja
              </p>
              <h2 className="text-2xl font-semibold text-foreground">
                Configure seu espaco de trabalho
              </h2>
            </div>
          </div>

          {recoverableStores.length > 0 && (
            <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Existe uma loja pendente de recuperacao para este e-mail
                  </p>
                  <p className="text-sm leading-6 text-amber-900/80 dark:text-amber-100/80">
                    Por seguranca, nao vinculamos a loja automaticamente a uma
                    nova conta. Fale com o suporte da Clica e Pede para recuperar
                    acesso ou crie uma nova loja abaixo.
                  </p>
                </div>
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <Label className="gap-2">
              Nome da loja
              <Input
                value={values.name}
                onChange={event => updateName(event.target.value)}
                error={errors.name}
                placeholder="Ex: Clica e Pede Restaurante"
                autoFocus
              />
            </Label>

            <Label className="gap-2">
              Endereco publico
              <div className="grid gap-2">
                <div className="flex rounded border bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-primary/20 dark:bg-input/30">
                  <Input
                    value={values.subdomain}
                    onChange={event => updateSubdomain(event.target.value)}
                    error={errors.subdomain}
                    placeholder="clica-e-pede"
                    className="rounded-r-none border-0 shadow-none focus-visible:ring-0"
                    containerClassName="min-w-0"
                  />
                  <span className="flex shrink-0 items-center border-l bg-muted/50 px-3 text-sm text-muted-foreground dark:bg-background/20">
                    .clicapedidos.com.br
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Previa: <span className="font-medium">{previewUrl}</span>
                </p>
              </div>
            </Label>

            {errors.root && (
              <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errors.root}
              </div>
            )}

            <div className="rounded-md border border-primary/15 bg-primary/5 p-4 dark:border-primary/20 dark:bg-primary/10">
              <div className="flex gap-3">
                <WandSparkles className="mt-0.5 h-4 w-4 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    O que acontece ao continuar
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Criamos a loja, vinculamos seu usuario como proprietario e
                    abrimos o painel para voce comecar pelos produtos ou pelo
                    caixa.
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={isPending}
              disabled={isPending}
            >
              Criar loja e entrar
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}
