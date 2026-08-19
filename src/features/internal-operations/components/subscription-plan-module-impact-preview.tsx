'use client'

import {
  buildPlanChangeModuleImpactPreview,
  getModuleTreatmentLabel,
  type PlanChangeModulePreviewItem,
  type subscriptionPlanChangeModuleTreatments,
} from '@/features/internal-operations/subscription-plan-change-policy'
import { getBillingIntervalLabel } from '@/features/internal-operations/subscription-terms-policy'
import { Badge } from '@/shared/badge'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { useMemo, useState } from 'react'

type BillingPlanPreviewOption = {
  id: number
  code: string
  name: string
  defaultAmount: string
  currency: string
  billingInterval: string
  billingIntervalCount: number
  modules: {
    moduleId: number
    code: string
    name: string
  }[]
}

type ModuleTreatment = (typeof subscriptionPlanChangeModuleTreatments)[number]

type SubscriptionPlanModuleImpactPreviewProps = {
  plans: BillingPlanPreviewOption[]
  currentModules: PlanChangeModulePreviewItem[]
  disabled?: boolean
}

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const formatCurrency = (value: string | number | null, currency = 'BRL') => {
  if (value === null || value === undefined || value === '') return 'Sem valor'

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(Number(value))
}

export function SubscriptionPlanModuleImpactPreview({
  plans,
  currentModules,
  disabled = false,
}: SubscriptionPlanModuleImpactPreviewProps) {
  const [targetPlanId, setTargetPlanId] = useState('')
  const [moduleTreatment, setModuleTreatment] =
    useState<ModuleTreatment>('sync_to_new_plan')
  const selectedPlan = plans.find(plan => String(plan.id) === targetPlanId)
  const preview = useMemo(() => {
    if (!selectedPlan) return null

    return buildPlanChangeModuleImpactPreview({
      currentModules,
      targetModules: selectedPlan.modules,
      moduleTreatment,
    })
  }, [currentModules, moduleTreatment, selectedPlan])

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="targetPlanId" size="sm">
            Novo plano
          </Label>
          <select
            id="targetPlanId"
            name="targetPlanId"
            className={selectClassName}
            value={targetPlanId}
            onChange={event => setTargetPlanId(event.target.value)}
            required
            disabled={disabled || plans.length === 0}
          >
            <option value="">Selecione um plano</option>
            {plans.map(plan => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.code}) -{' '}
                {formatCurrency(plan.defaultAmount, plan.currency)} /{' '}
                {getBillingIntervalLabel({
                  billingInterval: plan.billingInterval,
                  billingIntervalCount: plan.billingIntervalCount,
                })}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="moduleTreatment" size="sm">
            Tratamento dos modulos
          </Label>
          <select
            id="moduleTreatment"
            name="moduleTreatment"
            className={selectClassName}
            value={moduleTreatment}
            onChange={event =>
              setModuleTreatment(event.target.value as ModuleTreatment)
            }
            disabled={disabled}
            required
          >
            <option value="sync_to_new_plan">
              {getModuleTreatmentLabel('sync_to_new_plan')}
            </option>
            <option value="keep_current">
              {getModuleTreatmentLabel('keep_current')}
            </option>
            <option value="manual_review">
              {getModuleTreatmentLabel('manual_review')}
            </option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border bg-background/70 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              Previa de impacto dos modulos
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Veja o que muda na composicao antes de confirmar a troca.
            </p>
          </div>
          <Badge variant="outline">Antes de confirmar</Badge>
        </div>

        {preview && selectedPlan ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedPlan.name}:
              </span>{' '}
              {preview.summary}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <ImpactList
                label="Entram no plano"
                tone="positive"
                values={preview.addedModuleNames}
                emptyLabel="Nenhum modulo novo"
              />
              <ImpactList
                label="Saem do plano"
                tone="danger"
                values={preview.removedPlanModuleNames}
                emptyLabel="Nada sai do plano"
              />
              <ImpactList
                label={
                  moduleTreatment === 'manual_review'
                    ? 'Preservados para revisao'
                    : 'Preservados como excecao'
                }
                tone="attention"
                values={preview.preservedExceptionModuleNames}
                emptyLabel="Nenhuma excecao preservada"
              />
            </div>
            {preview.existingExceptionModuleNames.length > 0 && (
              <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
                Ja estavam liberados como adicional, cortesia ou manual:{' '}
                {preview.existingExceptionModuleNames.join(', ')}. Revise a
                cobranca dessas excecoes depois da troca, se necessario.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
            Selecione um plano para visualizar quais modulos entram, saem ou
            precisam de revisao.
          </div>
        )}
      </div>
    </div>
  )
}

function ImpactList({
  label,
  values,
  emptyLabel,
  tone,
}: {
  label: string
  values: string[]
  emptyLabel: string
  tone: 'positive' | 'danger' | 'attention'
}) {
  const toneClassName = {
    positive:
      'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100',
    danger:
      'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100',
    attention:
      'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100',
  }[tone]

  return (
    <div className={cn('rounded-md border p-3', toneClassName)}>
      <div className="text-xs font-semibold">{label}</div>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {values.slice(0, 5).map(value => (
            <Badge key={value} variant="outline" className="bg-background/60">
              {value}
            </Badge>
          ))}
          {values.length > 5 && (
            <Badge variant="outline" className="bg-background/60">
              +{values.length - 5}
            </Badge>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs opacity-80">{emptyLabel}</p>
      )}
    </div>
  )
}
