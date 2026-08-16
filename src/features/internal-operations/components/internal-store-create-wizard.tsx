'use client'

import {
  createInternalStoreAction,
  lookupInternalPostalCodeAction,
} from '@/features/internal-operations/actions'
import type {
  InternalBillingModuleOption,
  InternalBillingPlanOption,
  InternalStoreDuplicateMatch,
} from '@/features/internal-operations/db'
import {
  buildSubdomainFromStoreName,
  getInternalStoreCreationFieldErrors,
  getInternalStoreCreationStepErrors,
  internalStoreCreationInitialValues,
  internalStoreCreationSchema,
  internalStoreCreationSteps,
  isInternalStoreCreationStepValid,
  normalizeInternalPostalCode,
  type InternalStoreCreationField,
  type InternalStoreCreationStep,
  type InternalStoreCreationValues,
} from '@/features/internal-operations/internal-store-creation-policy'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Textarea } from '@/shared/textarea'
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  CreditCard,
  LayoutGrid,
  ListChecks,
  Loader2,
  MapPinned,
  UserRound,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'

type InternalStoreCreateWizardProps = {
  plans: InternalBillingPlanOption[]
  modules: InternalBillingModuleOption[]
}

type WizardErrors = Partial<Record<InternalStoreCreationField | 'root', string>>

const stepLabels: Record<
  InternalStoreCreationStep,
  { title: string; description: string; icon: typeof UserRound }
> = {
  responsible: {
    title: 'Responsavel',
    description: 'Usuario que sera admin principal da loja.',
    icon: UserRound,
  },
  establishment: {
    title: 'Estabelecimento',
    description: 'Dados publicos, contato e endereco operacional.',
    icon: Building2,
  },
  billing: {
    title: 'Plano e cobranca',
    description: 'Contrato comercial e ciclo de cobranca.',
    icon: CreditCard,
  },
  modules: {
    title: 'Modulos',
    description: 'Recursos inclusos no plano e liberacoes manuais.',
    icon: LayoutGrid,
  },
  review: {
    title: 'Revisao',
    description: 'Conferencia final antes de gravar no banco.',
    icon: ListChecks,
  },
}

const formatMoney = (value: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))

const getIntervalLabel = (plan: InternalBillingPlanOption) => {
  const labels: Record<string, string> = {
    monthly: 'mensal',
    quarterly: 'trimestral',
    semiannual: 'semestral',
    annual: 'anual',
  }

  return labels[plan.billingInterval] ?? plan.billingInterval
}

const getDefaultPlanAmount = (plan: InternalBillingPlanOption) =>
  Number(plan.defaultAmount).toFixed(2).replace('.', ',')

const createProvisioningIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `internal-store-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const FieldError = ({ error }: { error?: string }) =>
  error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null

const SummaryRow = ({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) => (
  <div className="flex items-start justify-between gap-4 border-b py-2 text-sm last:border-b-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="max-w-[60%] text-right font-medium text-foreground">
      {value || '-'}
    </span>
  </div>
)

export function InternalStoreCreateWizard({
  plans,
  modules,
}: InternalStoreCreateWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isPostalCodePending, startPostalCodeTransition] = useTransition()
  const [currentStep, setCurrentStep] =
    useState<InternalStoreCreationStep>('responsible')
  const [values, setValues] = useState<InternalStoreCreationValues>(() => ({
    ...internalStoreCreationInitialValues,
    provisioningIdempotencyKey: createProvisioningIdempotencyKey(),
  }))
  const [errors, setErrors] = useState<WizardErrors>({})
  const [duplicateMatches, setDuplicateMatches] = useState<
    InternalStoreDuplicateMatch[]
  >([])
  const [postalCodeMessage, setPostalCodeMessage] = useState<string | null>(
    null
  )
  const [lastPostalCodeLookup, setLastPostalCodeLookup] = useState('')
  const latestPostalCodeValueRef = useRef('')
  const postalCodeLookupRequestRef = useRef(0)
  const [subdomainTouched, setSubdomainTouched] = useState(false)

  const currentStepIndex = internalStoreCreationSteps.indexOf(currentStep)
  const selectedPlan = plans.find(plan => plan.id === values.planId) ?? null
  const planIncludedModuleIds = useMemo(
    () =>
      new Set(
        modules
          .filter(module => module.includedPlanIds.includes(values.planId))
          .map(module => module.id)
      ),
    [modules, values.planId]
  )
  const selectedAdditionalModules = modules.filter(module =>
    values.selectedModuleIds.includes(module.id)
  )
  const planIncludedModules = modules.filter(module =>
    planIncludedModuleIds.has(module.id)
  )
  const allSelectedModules = [
    ...planIncludedModules,
    ...selectedAdditionalModules.filter(
      module => !planIncludedModuleIds.has(module.id)
    ),
  ]

  const updateValue = <TField extends InternalStoreCreationField>(
    field: TField,
    value: InternalStoreCreationValues[TField]
  ) => {
    if (field === 'postalCode') {
      latestPostalCodeValueRef.current = String(value)
    }

    setValues(current => ({
      ...current,
      [field]: value,
      ...(field === 'duplicateOverrideConfirmed'
        ? {}
        : {
            duplicateOverrideConfirmed: false,
            duplicateReviewToken: '',
          }),
    }))
    setErrors(current => ({ ...current, [field]: undefined, root: undefined }))
    if (field !== 'duplicateOverrideConfirmed') setDuplicateMatches([])
  }

  const lookupPostalCode = (postalCode: string, force = false) => {
    const normalizedPostalCode = normalizeInternalPostalCode(postalCode)

    if (normalizedPostalCode.length !== 8) {
      if (force) setPostalCodeMessage('Informe um CEP com 8 digitos.')
      return
    }

    if (!force && normalizedPostalCode === lastPostalCodeLookup) return

    const requestId = postalCodeLookupRequestRef.current + 1
    postalCodeLookupRequestRef.current = requestId
    setPostalCodeMessage(null)

    startPostalCodeTransition(async () => {
      const result = await lookupInternalPostalCodeAction(normalizedPostalCode)

      if (
        postalCodeLookupRequestRef.current !== requestId ||
        normalizeInternalPostalCode(latestPostalCodeValueRef.current) !==
          normalizedPostalCode
      ) {
        return
      }

      if (!result.success) {
        setPostalCodeMessage(result.error)
        return
      }

      setValues(current => {
        if (
          normalizeInternalPostalCode(current.postalCode) !==
          normalizedPostalCode
        ) {
          return current
        }

        return {
          ...current,
          postalCode: result.address.postalCode,
          street: result.address.street || current.street,
          district: result.address.district || current.district,
          city: result.address.city || current.city,
          stateCode: result.address.stateCode || current.stateCode,
        }
      })
      latestPostalCodeValueRef.current = result.address.postalCode
      setLastPostalCodeLookup(normalizedPostalCode)
      setErrors(current => ({
        ...current,
        postalCode: undefined,
        street: undefined,
        district: undefined,
        city: undefined,
        stateCode: undefined,
        root: undefined,
      }))
      setPostalCodeMessage(
        'Endereco preenchido pelo CEP. Ajuste manualmente se precisar.'
      )
    })
  }

  const updateStoreName = (storeName: string) => {
    setValues(current => ({
      ...current,
      storeName,
      subdomain: subdomainTouched
        ? current.subdomain
        : buildSubdomainFromStoreName(storeName),
      duplicateOverrideConfirmed: false,
      duplicateReviewToken: '',
    }))
    setErrors(current => ({
      ...current,
      storeName: undefined,
      subdomain: undefined,
      root: undefined,
    }))
    setDuplicateMatches([])
  }

  const selectPlan = (planId: number) => {
    const plan = plans.find(option => option.id === planId)
    setValues(current => ({
      ...current,
      planId,
      contractedAmount: plan
        ? getDefaultPlanAmount(plan)
        : current.contractedAmount,
      selectedModuleIds: current.selectedModuleIds.filter(
        moduleId => !planIncludedModuleIds.has(moduleId)
      ),
      duplicateOverrideConfirmed: false,
      duplicateReviewToken: '',
    }))
    setErrors(current => ({
      ...current,
      planId: undefined,
      contractedAmount: undefined,
      root: undefined,
    }))
    setDuplicateMatches([])
  }

  const toggleModule = (moduleId: number) => {
    if (planIncludedModuleIds.has(moduleId)) return

    setValues(current => ({
      ...current,
      selectedModuleIds: current.selectedModuleIds.includes(moduleId)
        ? current.selectedModuleIds.filter(id => id !== moduleId)
        : [...current.selectedModuleIds, moduleId],
      duplicateOverrideConfirmed: false,
      duplicateReviewToken: '',
    }))
    setErrors(current => ({ ...current, selectedModuleIds: undefined }))
    setDuplicateMatches([])
  }

  const goToStep = (step: InternalStoreCreationStep) => {
    const targetIndex = internalStoreCreationSteps.indexOf(step)

    if (targetIndex <= currentStepIndex) {
      setCurrentStep(step)
      return
    }

    if (!isInternalStoreCreationStepValid({ step: currentStep, values })) {
      setErrors(current => ({
        ...current,
        ...getInternalStoreCreationStepErrors({ step: currentStep, values }),
      }))
      return
    }

    setCurrentStep(step)
  }

  const goNext = () => {
    if (!isInternalStoreCreationStepValid({ step: currentStep, values })) {
      setErrors(current => ({
        ...current,
        ...getInternalStoreCreationStepErrors({ step: currentStep, values }),
      }))
      return
    }

    const nextStep = internalStoreCreationSteps[currentStepIndex + 1]
    if (nextStep) setCurrentStep(nextStep)
  }

  const goPrevious = () => {
    const previousStep = internalStoreCreationSteps[currentStepIndex - 1]
    if (previousStep) setCurrentStep(previousStep)
  }

  const submit = () => {
    const parsedValues = internalStoreCreationSchema.safeParse(values)

    if (!parsedValues.success) {
      setErrors({
        ...getInternalStoreCreationFieldErrors(values),
        root: 'Revise os campos obrigatorios antes de cadastrar a loja.',
      })
      return
    }

    if (duplicateMatches.length > 0 && !values.duplicateOverrideConfirmed) {
      setErrors({
        root: 'Confirme a excecao de duplicidade antes de criar a loja.',
      })
      return
    }

    setErrors({})
    startTransition(async () => {
      const result = await createInternalStoreAction(parsedValues.data)

      if (!result.success) {
        if ('code' in result && result.code === 'DUPLICATE_REVIEW_REQUIRED') {
          setDuplicateMatches(result.duplicates)
          setValues(current => ({
            ...current,
            duplicateOverrideConfirmed: false,
            duplicateReviewToken: result.duplicateReviewToken,
          }))
          setCurrentStep('review')
        }

        setErrors({ root: result.error })
        return
      }

      router.push(`/internal/stores?result=loja-cadastrada`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/internal/stores">
              <ArrowLeft className="size-4" />
              Voltar para lojas
            </Link>
          </Button>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Operacao interna
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Cadastrar loja
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Crie a loja, vincule o responsavel, defina contrato e libere modulos
            sem acessar o banco.
          </p>
        </div>
        <Badge variant="outline" className="w-fit bg-card">
          Etapa {currentStepIndex + 1} de {internalStoreCreationSteps.length}
        </Badge>
      </div>

      {errors.root && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errors.root}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-2 lg:sticky lg:top-24 lg:self-start">
          {internalStoreCreationSteps.map((step, index) => {
            const Icon = stepLabels[step].icon
            const isActive = step === currentStep
            const isDone = index < currentStepIndex

            return (
              <button
                key={step}
                type="button"
                onClick={() => goToStep(step)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50',
                  isActive && 'border-primary bg-primary/5 dark:bg-primary/10'
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground',
                    isActive && 'border-primary/30 bg-primary/10 text-primary',
                    isDone &&
                      'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {stepLabels[step].title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {stepLabels[step].description}
                  </span>
                </span>
              </button>
            )
          })}
        </aside>

        <Card className="rounded-lg border-border bg-card shadow-xs hover:shadow-xs">
          <CardHeader className="border-b">
            <CardTitle>{stepLabels[currentStep].title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            {currentStep === 'responsible' && (
              <div className="grid gap-5 md:grid-cols-2">
                <Label size="sm">
                  Nome do responsavel
                  <Input
                    value={values.responsibleName}
                    onChange={event =>
                      updateValue('responsibleName', event.target.value)
                    }
                    error={errors.responsibleName}
                    placeholder="Ex: Bruno Giusti"
                  />
                </Label>
                <Label size="sm">
                  E-mail do responsavel
                  <Input
                    value={values.responsibleEmail}
                    onChange={event =>
                      updateValue('responsibleEmail', event.target.value)
                    }
                    error={errors.responsibleEmail}
                    placeholder="admin@restaurante.com"
                    type="email"
                  />
                </Label>
                <Label size="sm">
                  Telefone
                  <Input
                    value={values.responsiblePhone}
                    onChange={event =>
                      updateValue('responsiblePhone', event.target.value)
                    }
                    error={errors.responsiblePhone}
                    placeholder="(11) 99999-9999"
                  />
                </Label>
                <Label size="sm">
                  CPF
                  <Input
                    value={values.responsibleTaxNumber}
                    onChange={event =>
                      updateValue('responsibleTaxNumber', event.target.value)
                    }
                    error={errors.responsibleTaxNumber}
                    placeholder="Opcional"
                  />
                </Label>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100 md:col-span-2">
                  O responsavel precisa ja ter uma conta ativa no app. O wizard
                  nao cria usuario solto por e-mail para evitar reassociacao
                  automatica indevida.
                </div>
              </div>
            )}

            {currentStep === 'establishment' && (
              <div className="grid gap-5 md:grid-cols-2">
                <Label size="sm">
                  Nome da loja
                  <Input
                    value={values.storeName}
                    onChange={event => updateStoreName(event.target.value)}
                    error={errors.storeName}
                    placeholder="Ex: Clica e Pede Centro"
                  />
                </Label>
                <Label size="sm">
                  Endereco publico
                  <div className="flex rounded border bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-primary/20 dark:bg-input/30">
                    <Input
                      value={values.subdomain}
                      onChange={event => {
                        setSubdomainTouched(true)
                        updateValue(
                          'subdomain',
                          buildSubdomainFromStoreName(event.target.value)
                        )
                      }}
                      placeholder="clica-centro"
                      className="rounded-r-none border-0 shadow-none focus-visible:ring-0"
                      containerClassName="min-w-0"
                    />
                    <span className="flex shrink-0 items-center border-l bg-muted/50 px-3 text-sm text-muted-foreground dark:bg-background/20">
                      .clicapedidos.com.br
                    </span>
                  </div>
                  <FieldError error={errors.subdomain} />
                </Label>
                <Label size="sm">
                  CNPJ
                  <Input
                    value={values.companyTaxNumber}
                    onChange={event =>
                      updateValue('companyTaxNumber', event.target.value)
                    }
                    error={errors.companyTaxNumber}
                    placeholder="Opcional"
                  />
                </Label>
                <Label size="sm">
                  Razao social / nome fantasia
                  <Input
                    value={values.companyName}
                    onChange={event =>
                      updateValue('companyName', event.target.value)
                    }
                    error={errors.companyName}
                    placeholder="Opcional"
                  />
                </Label>
                <Label size="sm">
                  Telefone da loja
                  <Input
                    value={values.phone1}
                    onChange={event =>
                      updateValue('phone1', event.target.value)
                    }
                    error={errors.phone1}
                    placeholder="(11) 3333-3333"
                  />
                </Label>
                <Label size="sm">
                  E-mail da loja
                  <Input
                    value={values.companyEmail}
                    onChange={event =>
                      updateValue('companyEmail', event.target.value)
                    }
                    error={errors.companyEmail}
                    placeholder="contato@restaurante.com"
                    type="email"
                  />
                </Label>
                <Label size="sm">
                  CEP
                  <div className="flex gap-2">
                    <Input
                      value={values.postalCode}
                      onChange={event => {
                        const nextPostalCode = event.target.value
                        updateValue('postalCode', nextPostalCode)
                        setPostalCodeMessage(null)

                        if (
                          normalizeInternalPostalCode(nextPostalCode).length ===
                          8
                        ) {
                          lookupPostalCode(nextPostalCode)
                        }
                      }}
                      onBlur={() => lookupPostalCode(values.postalCode)}
                      error={errors.postalCode}
                      placeholder="00000-000"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      containerClassName="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => lookupPostalCode(values.postalCode, true)}
                      disabled={isPostalCodePending}
                    >
                      {isPostalCodePending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <MapPinned className="size-4" />
                      )}
                      Buscar
                    </Button>
                  </div>
                  {postalCodeMessage && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {postalCodeMessage}
                    </p>
                  )}
                </Label>
                <Label size="sm">
                  Endereco
                  <Input
                    value={values.street}
                    onChange={event =>
                      updateValue('street', event.target.value)
                    }
                    error={errors.street}
                    placeholder="Rua, avenida..."
                  />
                </Label>
                <Label size="sm">
                  Numero
                  <Input
                    value={values.number}
                    onChange={event =>
                      updateValue('number', event.target.value)
                    }
                    error={errors.number}
                    placeholder="100"
                  />
                </Label>
                <Label size="sm">
                  Bairro
                  <Input
                    value={values.district}
                    onChange={event =>
                      updateValue('district', event.target.value)
                    }
                    error={errors.district}
                    placeholder="Centro"
                  />
                </Label>
                <Label size="sm">
                  Cidade
                  <Input
                    value={values.city}
                    onChange={event => updateValue('city', event.target.value)}
                    error={errors.city}
                    placeholder="Sao Paulo"
                  />
                </Label>
                <Label size="sm">
                  UF
                  <Input
                    value={values.stateCode}
                    onChange={event =>
                      updateValue(
                        'stateCode',
                        event.target.value.toUpperCase().slice(0, 2)
                      )
                    }
                    error={errors.stateCode}
                    placeholder="SP"
                  />
                </Label>
              </div>
            )}

            {currentStep === 'billing' && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  {plans.map(plan => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => selectPlan(plan.id)}
                      className={cn(
                        'rounded-lg border bg-background p-4 text-left transition-colors hover:bg-accent/50',
                        values.planId === plan.id &&
                          'border-primary bg-primary/5 dark:bg-primary/10'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{plan.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {plan.description || plan.code}
                          </p>
                        </div>
                        {values.planId === plan.id && (
                          <BadgeCheck className="size-5 text-primary" />
                        )}
                      </div>
                      <div className="mt-4 text-sm">
                        <span className="font-semibold">
                          {formatMoney(plan.defaultAmount)}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          / {getIntervalLabel(plan)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <FieldError error={errors.planId} />

                <div className="grid gap-5 md:grid-cols-3">
                  <Label size="sm">
                    Valor contratado
                    <Input
                      value={values.contractedAmount}
                      onChange={event =>
                        updateValue('contractedAmount', event.target.value)
                      }
                      error={errors.contractedAmount}
                      placeholder="199,90"
                    />
                  </Label>
                  <Label size="sm">
                    Tipo de desconto
                    <select
                      value={values.discountType}
                      onChange={event =>
                        updateValue(
                          'discountType',
                          event.target
                            .value as InternalStoreCreationValues['discountType']
                        )
                      }
                      className="border-input dark:bg-input/30 h-9 w-full rounded border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/20"
                    >
                      <option value="none">Sem desconto</option>
                      <option value="fixed_amount">Valor fixo</option>
                      <option value="percentage">Percentual</option>
                    </select>
                  </Label>
                  <Label size="sm">
                    Desconto
                    <Input
                      value={values.discountValue}
                      onChange={event =>
                        updateValue('discountValue', event.target.value)
                      }
                      error={errors.discountValue}
                      placeholder={
                        values.discountType === 'percentage' ? '10' : '50,00'
                      }
                      disabled={values.discountType === 'none'}
                    />
                  </Label>
                </div>
              </div>
            )}

            {currentStep === 'modules' && (
              <div className="space-y-4">
                {!selectedPlan && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
                    Selecione um plano na etapa anterior para ver os modulos
                    inclusos.
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {modules.map(module => {
                    const includedByPlan = planIncludedModuleIds.has(module.id)
                    const checked =
                      includedByPlan ||
                      values.selectedModuleIds.includes(module.id)

                    return (
                      <label
                        key={module.id}
                        className={cn(
                          'flex cursor-pointer gap-3 rounded-lg border bg-background p-4 transition-colors hover:bg-accent/50',
                          checked &&
                            'border-primary bg-primary/5 dark:bg-primary/10',
                          includedByPlan && 'cursor-default'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={includedByPlan}
                          onChange={() => toggleModule(module.id)}
                          className="mt-1 size-4 accent-primary"
                        />
                        <span>
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{module.name}</span>
                            {includedByPlan && (
                              <Badge variant="secondary">
                                Incluso no plano
                              </Badge>
                            )}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {module.description || module.code}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {currentStep === 'review' && (
              <div className="space-y-5">
                {duplicateMatches.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                      <div className="space-y-3">
                        <div>
                          <p className="font-semibold">
                            Possivel duplicidade encontrada
                          </p>
                          <p className="mt-1 text-sm">
                            Confira os registros abaixo. Os dados sensiveis
                            aparecem mascarados para proteger clientes e
                            responsaveis.
                          </p>
                        </div>
                        <div className="space-y-2">
                          {duplicateMatches.map(match => (
                            <div
                              key={match.storeId}
                              className="rounded-md border border-amber-200 bg-background/70 p-3 text-sm dark:border-amber-900/70"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                  Loja #{match.storeId} - {match.storeName}
                                </span>
                                <Badge variant="outline">{match.status}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Endereco publico: {match.subdomain}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {match.matchedFields.map(field => (
                                  <Badge
                                    key={`${match.storeId}-${field.field}`}
                                    variant="secondary"
                                  >
                                    {field.label}: {field.value}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={values.duplicateOverrideConfirmed}
                            onChange={event =>
                              updateValue(
                                'duplicateOverrideConfirmed',
                                event.target.checked
                              )
                            }
                            className="mt-1 size-4 accent-primary"
                          />
                          <span>
                            Confirmo que revisei a possivel duplicidade e tenho
                            autorizacao para criar esta loja mesmo assim.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="rounded-lg py-4 shadow-xs hover:shadow-xs">
                    <CardHeader className="px-4">
                      <CardTitle className="text-base">Responsavel</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4">
                      <SummaryRow label="Nome" value={values.responsibleName} />
                      <SummaryRow
                        label="E-mail"
                        value={values.responsibleEmail}
                      />
                      <SummaryRow
                        label="Telefone"
                        value={values.responsiblePhone}
                      />
                    </CardContent>
                  </Card>
                  <Card className="rounded-lg py-4 shadow-xs hover:shadow-xs">
                    <CardHeader className="px-4">
                      <CardTitle className="text-base">Loja</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4">
                      <SummaryRow label="Nome" value={values.storeName} />
                      <SummaryRow label="URL" value={values.subdomain} />
                      <SummaryRow
                        label="Cidade/UF"
                        value={`${values.city || '-'} / ${values.stateCode || '-'}`}
                      />
                    </CardContent>
                  </Card>
                  <Card className="rounded-lg py-4 shadow-xs hover:shadow-xs">
                    <CardHeader className="px-4">
                      <CardTitle className="text-base">Plano</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4">
                      <SummaryRow label="Plano" value={selectedPlan?.name} />
                      <SummaryRow
                        label="Valor"
                        value={values.contractedAmount}
                      />
                      <SummaryRow
                        label="Desconto"
                        value={
                          values.discountType === 'none'
                            ? 'Sem desconto'
                            : values.discountValue
                        }
                      />
                    </CardContent>
                  </Card>
                  <Card className="rounded-lg py-4 shadow-xs hover:shadow-xs">
                    <CardHeader className="px-4">
                      <CardTitle className="text-base">Modulos</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4">
                      <div className="flex flex-wrap gap-2">
                        {allSelectedModules.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            Nenhum modulo selecionado.
                          </span>
                        ) : (
                          allSelectedModules.map(module => (
                            <Badge key={module.id} variant="outline">
                              {module.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <Label size="sm">
                  Motivo do cadastro
                  <Textarea
                    value={values.reason}
                    onChange={event =>
                      updateValue('reason', event.target.value)
                    }
                    error={errors.reason}
                    placeholder="Ex.: novo cliente aprovado pelo comercial."
                    className="min-h-24"
                  />
                  <FieldError error={errors.reason} />
                </Label>
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-between gap-3 border-t bg-card/95 px-6 py-4 backdrop-blur">
              <Button
                variant="outline"
                onClick={goPrevious}
                disabled={currentStepIndex === 0 || isPending}
              >
                <ArrowLeft className="size-4" />
                Voltar
              </Button>
              {currentStep === 'review' ? (
                <Button
                  onClick={submit}
                  isLoading={isPending}
                  disabled={isPending}
                >
                  <CheckCircle2 className="size-4" />
                  Criar loja
                </Button>
              ) : (
                <Button onClick={goNext} disabled={isPending}>
                  Continuar
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
