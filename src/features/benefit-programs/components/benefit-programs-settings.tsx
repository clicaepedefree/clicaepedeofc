'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Switch } from '@/shared/switch'
import { useAtomValue } from 'jotai'
import { RefreshCw, Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useBenefitProgramsConfiguration } from '../hooks/use-benefit-programs-configuration'
import {
  BENEFIT_PROGRAM_MAX_INTEGER,
  benefitProgramsInputSchema,
} from '../policy'
import {
  changeLoyaltyEnabled,
  changeRewardType,
  toBenefitProgramsForm,
  toBenefitProgramsInput,
  type BenefitProgramsForm,
} from './benefit-programs-form'

const selectClassName =
  'h-11 w-full min-w-0 rounded border border-input bg-background px-3 text-base text-foreground focus-visible:outline-ring disabled:opacity-50 md:text-sm'
const accessHelp =
  'Confira sua permissão com o responsável pela loja e tente recarregar. Se o acesso estiver correto, tente novamente mais tarde.'

export const BenefitProgramsSettings = () => {
  const storeId = useAtomValue(selectedStoreIdAtom)
  if (!storeId)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Selecione uma loja para configurar os benefícios.
      </p>
    )
  return <StoreBenefitPrograms key={storeId} storeId={storeId} />
}

const StoreBenefitPrograms = ({ storeId }: { storeId: number }) => {
  const configuration = useBenefitProgramsConfiguration(storeId)
  if (configuration.isPending)
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Carregando benefícios...
      </p>
    )
  if (!configuration.data)
    return (
      <div className="space-y-3 p-4">
        <p role="alert" className="text-sm text-destructive">
          Não foi possível consultar os benefícios. {accessHelp}
        </p>
        <Button
          variant="outline"
          isLoading={configuration.isFetching}
          onClick={() => void configuration.refetch()}
        >
          <RefreshCw className="size-4" />
          Recarregar
        </Button>
      </div>
    )
  return <BenefitProgramsEditor configuration={configuration} />
}

type Configuration = ReturnType<typeof useBenefitProgramsConfiguration>

export const BenefitProgramsEditor = ({
  configuration,
}: {
  configuration: Configuration
}) => {
  const data = configuration.data!
  // The edit snapshot only changes after a successful save or an explicit reload.
  const [form, setForm] = useState(() => toBenefitProgramsForm(data))
  const [version, setVersion] = useState(data.version)
  const [configured, setConfigured] = useState(data.version > 0)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [requiresReload, setRequiresReload] = useState(false)
  const [reloading, setReloading] = useState(false)
  const locked =
    configuration.isSaving ||
    reloading ||
    requiresReload ||
    configuration.isError
  const update = (next: BenefitProgramsForm) => {
    setForm(next)
    setDirty(true)
  }

  const reload = async () => {
    setReloading(true)
    try {
      const result = await configuration.refetch()
      if (!configuration.isCurrentStore()) return
      if (result.error || !result.data) {
        setError(`Não foi possível recarregar. ${accessHelp}`)
        return
      }
      setForm(toBenefitProgramsForm(result.data))
      setVersion(result.data.version)
      setConfigured(result.data.version > 0)
      setDirty(false)
      setError('')
      setRequiresReload(false)
    } finally {
      setReloading(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (locked || !dirty) return
    setError('')
    const input = toBenefitProgramsInput(form, version)
    if (!benefitProgramsInputSchema.safeParse(input).success) {
      setError(
        'Confira os campos obrigatórios, os limites numéricos e os valores em reais ou percentual com até duas casas decimais.'
      )
      return
    }
    try {
      const result = await configuration.save(input)
      if (!result || !configuration.isCurrentStore()) return
      setVersion(result.version)
      setConfigured(true)
      setDirty(false)
    } catch (cause) {
      if (!configuration.isCurrentStore()) return
      const message = cause instanceof Error ? cause.message : ''
      if (
        /vers[aã]o|version|conflit|desatualiz|outra pessoa|configura[cç][aã]o (?:foi )?alterada/i.test(
          message
        )
      ) {
        setRequiresReload(true)
        setError(
          'A configuração foi alterada por outra pessoa. Recarregue a versão atual antes de editar e salvar novamente. Suas alterações não foram salvas.'
        )
      } else {
        setError(
          `Não foi possível salvar os benefícios. ${message && !/digest|Server Components|401P|403|unauthorized|forbidden|permiss[aã]o/i.test(message) ? message : accessHelp}`
        )
      }
    }
  }

  const numericField = (
    section: 'cashback' | 'loyalty',
    name: string,
    label: string,
    options: {
      min?: string
      max?: string
      step?: string
      required?: boolean
    } = {}
  ) => {
    const id = `benefits-${section}-${name}`
    const values = form[section]
    return (
      <div className="min-w-0 space-y-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <Input
          id={id}
          className="h-11"
          type="number"
          inputMode={options.step === '0.01' ? 'decimal' : 'numeric'}
          min={options.min ?? '1'}
          max={
            options.max ??
            (options.step === '0.01'
              ? '9999999999.99'
              : String(BENEFIT_PROGRAM_MAX_INTEGER))
          }
          step={options.step ?? '1'}
          required={options.required ?? values.enabled}
          value={String(values[name as keyof typeof values] ?? '')}
          onChange={event =>
            update({
              ...form,
              [section]: { ...values, [name]: event.target.value },
            })
          }
        />
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="min-w-0 space-y-4">
      <div className="space-y-2 px-1 text-sm text-muted-foreground">
        <p role="status">
          {configured
            ? `Versão ${version}`
            : `Não configurado · Versão ${version}`}
          {dirty ? ' · Alterações não salvas' : ''}
        </p>
      </div>
      {error && (
        <p role="alert" className="break-words text-sm text-destructive">
          {error}
        </p>
      )}
      {configuration.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível verificar a configuração atual. Suas alterações foram
          mantidas. {accessHelp}
        </p>
      )}
      <SettingsCategoryBlock title="Cashback" contentClassName="grid-cols-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Retorno percentual sobre pedidos elegíveis.
          </p>
          <label
            className="flex min-h-11 items-center gap-3 text-sm font-medium"
            htmlFor="benefits-cashback-enabled"
          >
            Ativar cashback
            <Switch
              id="benefits-cashback-enabled"
              checked={form.cashback.enabled}
              disabled={
                locked || (!data.modules.cashback && !form.cashback.enabled)
              }
              onCheckedChange={enabled => {
                if (locked || (enabled && !data.modules.cashback)) return
                update({ ...form, cashback: { ...form.cashback, enabled } })
              }}
            />
          </label>
        </div>
        {!data.modules.cashback && (
          <p className="text-sm text-muted-foreground">
            Módulo de cashback indisponível para esta loja. Fale com o
            responsável pela assinatura para verificar a disponibilidade.
          </p>
        )}
        <fieldset
          disabled={locked || !data.modules.cashback || !form.cashback.enabled}
          className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <legend className="sr-only">Regras de cashback</legend>
          {numericField(
            'cashback',
            'percentage',
            'Percentual de cashback (%)',
            {
              min: '0.01',
              max: '100',
              step: '0.01',
              required: form.cashback.enabled,
            }
          )}
          {numericField(
            'cashback',
            'minimumOrderAmount',
            'Pedido mínimo para cashback (R$)',
            { min: '0', step: '0.01' }
          )}
          {numericField(
            'cashback',
            'expiresAfterDays',
            'Validade do cashback (dias)'
          )}
        </fieldset>
      </SettingsCategoryBlock>
      <SettingsCategoryBlock title="Fidelidade" contentClassName="grid-cols-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Recompensa após completar um ciclo de pedidos elegíveis.
          </p>
          <label
            className="flex min-h-11 items-center gap-3 text-sm font-medium"
            htmlFor="benefits-loyalty-enabled"
          >
            Ativar fidelidade
            <Switch
              id="benefits-loyalty-enabled"
              checked={form.loyalty.enabled}
              disabled={
                locked || (!data.modules.loyalty && !form.loyalty.enabled)
              }
              onCheckedChange={enabled => {
                if (locked || (enabled && !data.modules.loyalty)) return
                update(changeLoyaltyEnabled(form, enabled, data.products))
              }}
            />
          </label>
        </div>
        {!data.modules.loyalty && (
          <p className="text-sm text-muted-foreground">
            Módulo de fidelidade indisponível para esta loja. Fale com o
            responsável pela assinatura para verificar a disponibilidade.
          </p>
        )}
        <fieldset
          disabled={locked || !data.modules.loyalty || !form.loyalty.enabled}
          className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <legend className="sr-only">Regras de fidelidade</legend>
          {numericField(
            'loyalty',
            'requiredOrders',
            'Pedidos para completar o ciclo',
            { required: form.loyalty.enabled }
          )}
          {numericField(
            'loyalty',
            'minimumOrderAmount',
            'Pedido mínimo para contar no ciclo (R$)',
            { min: '0', step: '0.01' }
          )}
          <div className="min-w-0 space-y-1">
            <label
              htmlFor="benefits-reward-type"
              className="text-sm font-medium"
            >
              Tipo de recompensa
            </label>
            <select
              id="benefits-reward-type"
              className={selectClassName}
              required={form.loyalty.enabled}
              value={form.loyalty.rewardType}
              onChange={event =>
                update(
                  changeRewardType(
                    form,
                    event.target
                      .value as BenefitProgramsForm['loyalty']['rewardType']
                  )
                )
              }
              aria-describedby="benefits-reward-type-hint"
            >
              <option value="">Selecione o tipo</option>
              <option value="cashback">Cashback</option>
              <option value="product">Produto</option>
            </select>
            <p
              id="benefits-reward-type-hint"
              className="text-xs text-muted-foreground"
            >
              Trocar o tipo limpa o valor e o produto da recompensa anterior.
            </p>
          </div>
          {form.loyalty.rewardType === 'cashback' &&
            numericField(
              'loyalty',
              'rewardAmount',
              'Valor da recompensa em cashback (R$)',
              { min: '0.01', step: '0.01', required: form.loyalty.enabled }
            )}
          {form.loyalty.rewardType === 'product' && (
            <div className="min-w-0 space-y-1">
              <label
                htmlFor="benefits-reward-product"
                className="text-sm font-medium"
              >
                Produto da recompensa
              </label>
              <select
                id="benefits-reward-product"
                className={selectClassName}
                required={form.loyalty.enabled}
                value={form.loyalty.rewardItemId}
                onChange={event =>
                  update({
                    ...form,
                    loyalty: {
                      ...form.loyalty,
                      rewardItemId: event.target.value,
                    },
                  })
                }
              >
                <option value="">Selecione um produto</option>
                {form.loyalty.rewardItemId &&
                  !data.products.some(
                    product => String(product.id) === form.loyalty.rewardItemId
                  ) && (
                    <option value={form.loyalty.rewardItemId} disabled>
                      Produto indisponível: selecione outro
                    </option>
                  )}
                {data.products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              {data.products.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum produto disponível. Cadastre um produto na loja ou
                  escolha cashback.
                </p>
              )}
            </div>
          )}
          {numericField(
            'loyalty',
            'rewardExpiresAfterDays',
            'Validade da recompensa (dias)'
          )}
        </fieldset>
      </SettingsCategoryBlock>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={configuration.isSaving || reloading}
          onClick={() => void reload()}
        >
          <RefreshCw className="size-4" />
          {dirty || requiresReload ? 'Descartar e recarregar' : 'Recarregar'}
        </Button>
        <Button
          type="submit"
          className="min-h-11"
          disabled={locked || !dirty}
          isLoading={configuration.isSaving}
        >
          <Save className="size-4" />
          Salvar benefícios
        </Button>
      </div>
    </form>
  )
}
