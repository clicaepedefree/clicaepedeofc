'use client'

import {
  normalizeStoreSubdomain,
  onboardingStoreSchema,
  type OnboardingStoreFormValues,
} from '@/features/store/form-validation/onboarding-store-schema'
import { useCreateAdditionalStore } from '@/features/store/hooks/use-create-additional-store'
import { Button } from '@/shared/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/dialog'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { AlertTriangle, Building2, Plus, WandSparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'

type FormErrors = Partial<Record<keyof OnboardingStoreFormValues | 'root', string>>

const initialValues: OnboardingStoreFormValues = {
  name: '',
  subdomain: '',
}

export const AdditionalStoreDialog = () => {
  const router = useRouter()
  const createStore = useCreateAdditionalStore()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<OnboardingStoreFormValues>(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [subdomainTouched, setSubdomainTouched] = useState(false)

  const previewUrl = useMemo(() => {
    const subdomain = values.subdomain || 'nova-loja'
    return `${subdomain}.clicapedidos.com.br`
  }, [values.subdomain])

  const resetForm = () => {
    setValues(initialValues)
    setErrors({})
    setSubdomainTouched(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (createStore.isPending) return

    setOpen(nextOpen)
    if (!nextOpen) resetForm()
  }

  const updateName = (name: string) => {
    setValues(current => ({
      name,
      subdomain: subdomainTouched
        ? current.subdomain
        : normalizeStoreSubdomain(name),
    }))
    setErrors(current => ({ ...current, name: undefined, root: undefined }))
  }

  const updateSubdomain = (subdomain: string) => {
    setSubdomainTouched(true)
    setValues(current => ({
      ...current,
      subdomain: normalizeStoreSubdomain(subdomain),
    }))
    setErrors(current => ({ ...current, subdomain: undefined, root: undefined }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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
    createStore.mutate(parsedValues.data, {
      onSuccess: () => {
        setOpen(false)
        resetForm()
        router.push('/settings/store')
        router.refresh()
      },
      onError: error => {
        setErrors({
          root:
            error instanceof Error
              ? error.message
              : 'Nao foi possivel criar a loja agora.',
        })
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Adicionar loja"
          className="h-9 border-primary/20 bg-primary/5 px-3 text-primary hover:bg-primary/10 hover:text-primary dark:border-primary/30 dark:bg-primary/10"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden lg:inline">Adicionar loja</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="border-b bg-muted/30 px-6 py-5 dark:bg-muted/10">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <DialogTitle>Adicionar nova loja</DialogTitle>
            <DialogDescription>
              Crie outro espaco de operacao e alterne entre as lojas pelo seletor
              do topo.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form className="space-y-5 px-6 py-5" onSubmit={handleSubmit}>
          <Label className="gap-2">
            Nome da loja
            <Input
              value={values.name}
              onChange={event => updateName(event.target.value)}
              error={errors.name}
              placeholder="Ex: Clica e Pede Centro"
              disabled={createStore.isPending}
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
                  placeholder="clica-centro"
                  disabled={createStore.isPending}
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
              <WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">
                A nova loja sera criada ativa, seu usuario sera proprietario e
                o painel mudara automaticamente para ela.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-100">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm leading-6">
                Se existir uma loja pendente de recuperacao para este e-mail,
                ela continuara aguardando suporte. Criar uma nova loja nao
                recupera nem reassocia lojas antigas automaticamente.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={createStore.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              isLoading={createStore.isPending}
              disabled={createStore.isPending}
            >
              Criar loja
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
