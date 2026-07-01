'use client'

import { useStoreDeliveryConfiguration } from '@/features/store/hooks/use-store-delivery-configuration'
import { Badge } from '@/shared/badge'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Switch } from '@/shared/switch'
import { Textarea } from '@/shared/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { cn } from '@/shared/lib/utils'
import { Banknote, CreditCard, Landmark, Plus, Save, Trash2, Truck, Edit3, MapPin, WalletCards } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'

type ZoneType = 'FIXED' | 'NEIGHBORHOOD' | 'RADIUS' | 'POSTAL_CODE'
type PaymentMethodId =
  | 'CASH'
  | 'PIX'
  | 'CREDIT'
  | 'DEBIT'
  | 'MEAL_VOUCHER'
  | 'FOOD_VOUCHER'
  | 'ONLINE'

type ZoneFormState = {
  id?: number
  type: ZoneType
  name: string
  neighborhood: string
  postalCodePrefix: string
  centerLat: string
  centerLng: string
  radiusKm: string
  deliveryFee: string
  freeDeliveryMinimum: string
  minimumOrderAmount: string
  estimatedDeliveryMinutes: string
  priority: string
  isActive: boolean
}

type PaymentMethodFormState = {
  method: PaymentMethodId
  isActive: boolean
  allowDelivery: boolean
  allowTakeout: boolean
  requiresChangeFor: boolean
  instructions: string
  proofInstructions: string
  pixKey: string
  integrationProvider: string
}

const emptyZoneForm: ZoneFormState = {
  type: 'NEIGHBORHOOD',
  name: '',
  neighborhood: '',
  postalCodePrefix: '',
  centerLat: '',
  centerLng: '',
  radiusKm: '',
  deliveryFee: '0',
  freeDeliveryMinimum: '',
  minimumOrderAmount: '',
  estimatedDeliveryMinutes: '45',
  priority: '0',
  isActive: true,
}

const zoneTypeLabels: Record<ZoneType, string> = {
  FIXED: 'Taxa fixa',
  NEIGHBORHOOD: 'Bairro',
  RADIUS: 'Raio',
  POSTAL_CODE: 'CEP',
}

const paymentMethodLabels: Record<PaymentMethodId, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT: 'Cartao de credito na entrega',
  DEBIT: 'Cartao de debito na entrega',
  MEAL_VOUCHER: 'Vale-refeicao',
  FOOD_VOUCHER: 'Vale-alimentacao',
  ONLINE: 'Pagamento online',
}

const paymentMethodHints: Record<PaymentMethodId, string> = {
  CASH: 'Pergunte se o cliente precisa de troco antes de enviar o pedido.',
  PIX: 'Mostre a chave Pix e oriente o envio do comprovante.',
  CREDIT: 'Pagamento manual pela maquininha na entrega ou retirada.',
  DEBIT: 'Pagamento manual pela maquininha na entrega ou retirada.',
  MEAL_VOUCHER: 'Use quando a loja aceita vale-refeicao.',
  FOOD_VOUCHER: 'Use quando a loja aceita vale-alimentacao.',
  ONLINE: 'Estrutura preparada para link, gateway ou Pix automatico futuro.',
}

const paymentMethodIcons: Record<PaymentMethodId, typeof Banknote> = {
  CASH: Banknote,
  PIX: Landmark,
  CREDIT: CreditCard,
  DEBIT: CreditCard,
  MEAL_VOUCHER: WalletCards,
  FOOD_VOUCHER: WalletCards,
  ONLINE: CreditCard,
}

const defaultPaymentMethodsForm: PaymentMethodFormState[] = (
  [
    'PIX',
    'CASH',
    'CREDIT',
    'DEBIT',
    'MEAL_VOUCHER',
    'FOOD_VOUCHER',
    'ONLINE',
  ] as PaymentMethodId[]
).map(method => ({
  method,
  isActive: method === 'PIX' || method === 'CASH',
  allowDelivery: true,
  allowTakeout: true,
  requiresChangeFor: method === 'CASH',
  instructions: '',
  proofInstructions:
    method === 'PIX' ? 'Envie o comprovante pelo WhatsApp da loja.' : '',
  pixKey: '',
  integrationProvider: '',
}))

const mergePaymentMethods = (
  paymentMethods:
    | {
        method: string
        isActive: boolean
        allowDelivery: boolean
        allowTakeout: boolean
        requiresChangeFor: boolean
        instructions: string | null
        proofInstructions: string | null
        pixKey: string | null
        integrationProvider: string | null
      }[]
    | undefined
) =>
  defaultPaymentMethodsForm.map(defaultMethod => {
    const saved = paymentMethods?.find(method => method.method === defaultMethod.method)
    if (!saved) return defaultMethod

    return {
      ...defaultMethod,
      isActive: saved.isActive,
      allowDelivery: saved.allowDelivery,
      allowTakeout: saved.allowTakeout,
      requiresChangeFor: saved.requiresChangeFor,
      instructions: saved.instructions ?? '',
      proofInstructions: saved.proofInstructions ?? '',
      pixKey: saved.pixKey ?? '',
      integrationProvider: saved.integrationProvider ?? '',
    }
  })

const money = (value: string | null | undefined) => {
  if (!value) return '-'
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

const numberOrZero = (value: string) => Number(value.replace(',', '.')) || 0

const getZoneAreaLabel = (zone: {
  type: ZoneType
  neighborhood: string | null
  postalCodePrefix: string | null
  radiusMeters: number | null
  centerLat: string | null
  centerLng: string | null
}) => {
  if (zone.type === 'FIXED') return 'Toda área atendida'
  if (zone.type === 'NEIGHBORHOOD') return zone.neighborhood ?? '-'
  if (zone.type === 'POSTAL_CODE') return `CEP ${zone.postalCodePrefix ?? '-'}`
  if (zone.type === 'RADIUS') {
    const radiusKm = zone.radiusMeters ? zone.radiusMeters / 1000 : 0
    return `${radiusKm.toLocaleString('pt-BR')} km de ${zone.centerLat}, ${zone.centerLng}`
  }
  return '-'
}

export const StoreDeliverySettings = () => {
  const {
    selectedStoreId,
    data,
    isLoading,
    saveSettings,
    saveZone,
    savePaymentMethods,
    deleteZone,
    isSavingSettings,
    isSavingZone,
    isSavingPaymentMethods,
    isDeletingZone,
  } = useStoreDeliveryConfiguration()

  const [minimumOrderAmount, setMinimumOrderAmount] = useState('0')
  const [averagePreparationMinutes, setAveragePreparationMinutes] = useState('30')
  const [zoneForm, setZoneForm] = useState<ZoneFormState>(emptyZoneForm)
  const [paymentMethodsForm, setPaymentMethodsForm] = useState(
    defaultPaymentMethodsForm
  )

  useEffect(() => {
    if (!data?.settings) return
    setMinimumOrderAmount(String(Number(data.settings.minimumOrderAmount)))
    setAveragePreparationMinutes(String(data.settings.averagePreparationMinutes))
  }, [data?.settings])

  useEffect(() => {
    setPaymentMethodsForm(mergePaymentMethods(data?.paymentMethods))
  }, [data?.paymentMethods])

  const activeZonesCount = useMemo(
    () => data?.zones.filter(zone => zone.isActive).length ?? 0,
    [data?.zones]
  )

  if (!selectedStoreId) {
    return (
      <SettingsCategoryBlock id="digital-menu-delivery" title="Entrega do cardápio digital" contentClassName="grid-cols-1">
        <p className="text-sm text-muted-foreground">
          Selecione uma loja para configurar as regras de entrega.
        </p>
      </SettingsCategoryBlock>
    )
  }

  const resetZoneForm = () => setZoneForm(emptyZoneForm)

  const submitSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveSettings({
      minimumOrderAmount: numberOrZero(minimumOrderAmount),
      averagePreparationMinutes: numberOrZero(averagePreparationMinutes),
    })
  }

  const submitZone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveZone({
      id: zoneForm.id,
      type: zoneForm.type,
      name: zoneForm.name,
      neighborhood: zoneForm.neighborhood,
      postalCodePrefix: zoneForm.postalCodePrefix,
      centerLat: zoneForm.centerLat,
      centerLng: zoneForm.centerLng,
      radiusMeters:
        zoneForm.type === 'RADIUS'
          ? Math.round(numberOrZero(zoneForm.radiusKm) * 1000)
          : null,
      deliveryFee: numberOrZero(zoneForm.deliveryFee),
      freeDeliveryMinimum: zoneForm.freeDeliveryMinimum
        ? numberOrZero(zoneForm.freeDeliveryMinimum)
        : '',
      minimumOrderAmount: zoneForm.minimumOrderAmount
        ? numberOrZero(zoneForm.minimumOrderAmount)
        : '',
      estimatedDeliveryMinutes: numberOrZero(zoneForm.estimatedDeliveryMinutes),
      priority: numberOrZero(zoneForm.priority),
      isActive: zoneForm.isActive,
    })
    resetZoneForm()
  }

  const updatePaymentMethod = (
    method: PaymentMethodId,
    values: Partial<PaymentMethodFormState>
  ) => {
    setPaymentMethodsForm(current =>
      current.map(payment =>
        payment.method === method ? { ...payment, ...values } : payment
      )
    )
  }

  const submitPaymentMethods = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    savePaymentMethods(paymentMethodsForm)
  }

  return (
    <div className="space-y-4">
      <SettingsCategoryBlock title="Entrega do cardápio digital" contentClassName="grid-cols-1">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Truck className="size-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Regras de entrega</h2>
                <p className="text-sm text-muted-foreground">
                  Configure taxa, prazo, pedido mínimo e cobertura antes do cliente fechar o pedido.
                </p>
              </div>
            </div>
          </div>
          <Badge className="w-fit border-primary/20 bg-primary/10 text-primary">
            {activeZonesCount} regiões ativas
          </Badge>
        </div>

        <form onSubmit={submitSettings} className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1 text-sm font-medium">
            Pedido mínimo padrão
            <Input
              type="number"
              min="0"
              step="0.01"
              value={minimumOrderAmount}
              onChange={event => setMinimumOrderAmount(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Prazo padrão em minutos
            <Input
              type="number"
              min="1"
              max="600"
              value={averagePreparationMinutes}
              onChange={event => setAveragePreparationMinutes(event.target.value)}
            />
          </label>
          <Button className="self-end" type="submit" isLoading={isSavingSettings}>
            <Save className="size-4" />
            Salvar padrão
          </Button>
        </form>
      </SettingsCategoryBlock>

      <SettingsCategoryBlock id="digital-menu-payments" title="Pagamentos do cardapio digital" contentClassName="grid-cols-1">
        <form onSubmit={submitPaymentMethods} className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-2">
            {paymentMethodsForm.map(method => {
              const Icon = paymentMethodIcons[method.method]

              return (
                <div
                  key={method.method}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">
                          {paymentMethodLabels[method.method]}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {paymentMethodHints[method.method]}
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      Ativo
                      <Switch
                        checked={method.isActive}
                        onCheckedChange={checked =>
                          updatePaymentMethod(method.method, { isActive: checked })
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm">
                      Entrega
                      <Switch
                        checked={method.allowDelivery}
                        onCheckedChange={checked =>
                          updatePaymentMethod(method.method, {
                            allowDelivery: checked,
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm">
                      Retirada
                      <Switch
                        checked={method.allowTakeout}
                        onCheckedChange={checked =>
                          updatePaymentMethod(method.method, {
                            allowTakeout: checked,
                          })
                        }
                      />
                    </label>
                  </div>

                  {method.method === 'CASH' && (
                    <label className="mt-3 flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm">
                      Perguntar se precisa de troco
                      <Switch
                        checked={method.requiresChangeFor}
                        onCheckedChange={checked =>
                          updatePaymentMethod(method.method, {
                            requiresChangeFor: checked,
                          })
                        }
                      />
                    </label>
                  )}

                  {method.method === 'PIX' && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm font-medium">
                        Chave Pix
                        <Input
                          value={method.pixKey}
                          onChange={event =>
                            updatePaymentMethod(method.method, {
                              pixKey: event.target.value,
                            })
                          }
                          placeholder="CPF, CNPJ, e-mail ou chave aleatoria"
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium">
                        Provedor futuro
                        <Input
                          value={method.integrationProvider}
                          onChange={event =>
                            updatePaymentMethod(method.method, {
                              integrationProvider: event.target.value,
                            })
                          }
                          placeholder="Ex: manual, mercado-pago"
                        />
                      </label>
                    </div>
                  )}

                  {method.method === 'ONLINE' && (
                    <label className="mt-3 block space-y-1 text-sm font-medium">
                      Provedor ou observacao interna
                      <Input
                        value={method.integrationProvider}
                        onChange={event =>
                          updatePaymentMethod(method.method, {
                            integrationProvider: event.target.value,
                          })
                        }
                        placeholder="Ex: gateway futuro, link de pagamento"
                      />
                    </label>
                  )}

                  <label className="mt-3 block space-y-1 text-sm font-medium">
                    Instrucao exibida no checkout
                    <Textarea
                      className="min-h-20"
                      value={method.instructions}
                      onChange={event =>
                        updatePaymentMethod(method.method, {
                          instructions: event.target.value,
                        })
                      }
                      placeholder="Ex: pague na entrega, envie comprovante ou aguarde confirmacao."
                    />
                  </label>

                  {method.method === 'PIX' && (
                    <label className="mt-3 block space-y-1 text-sm font-medium">
                      Instrucao de comprovante
                      <Textarea
                        className="min-h-16"
                        value={method.proofInstructions}
                        onChange={event =>
                          updatePaymentMethod(method.method, {
                            proofInstructions: event.target.value,
                          })
                        }
                        placeholder="Ex: envie o comprovante no WhatsApp apos finalizar."
                      />
                    </label>
                  )}
                </div>
              )
            })}
          </div>
          <Button type="submit" isLoading={isSavingPaymentMethods}>
            <Save className="size-4" />
            Salvar pagamentos
          </Button>
        </form>
      </SettingsCategoryBlock>

      <SettingsCategoryBlock
        title={zoneForm.id ? 'Editar região de entrega' : 'Adicionar região de entrega'}
        contentClassName="grid-cols-1"
      >
        <form onSubmit={submitZone} className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[220px_1fr_160px_160px]">
            <label className="space-y-1 text-sm font-medium">
              Tipo de regra
              <select
                className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-primary/20 focus-visible:ring-[3px]"
                value={zoneForm.type}
                onChange={event =>
                  setZoneForm(current => ({
                    ...current,
                    type: event.target.value as ZoneType,
                  }))
                }
              >
                {Object.entries(zoneTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Nome interno
              <Input
                value={zoneForm.name}
                onChange={event => setZoneForm(current => ({ ...current, name: event.target.value }))}
                placeholder="Ex: Centro, Raio 5 km"
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Taxa
              <Input
                type="number"
                min="0"
                step="0.01"
                value={zoneForm.deliveryFee}
                onChange={event => setZoneForm(current => ({ ...current, deliveryFee: event.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Prazo
              <Input
                type="number"
                min="1"
                value={zoneForm.estimatedDeliveryMinutes}
                onChange={event => setZoneForm(current => ({ ...current, estimatedDeliveryMinutes: event.target.value }))}
              />
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {zoneForm.type === 'NEIGHBORHOOD' && (
              <label className="space-y-1 text-sm font-medium">
                Bairro atendido
                <Input
                  value={zoneForm.neighborhood}
                  onChange={event => setZoneForm(current => ({ ...current, neighborhood: event.target.value }))}
                  required
                />
              </label>
            )}
            {zoneForm.type === 'POSTAL_CODE' && (
              <label className="space-y-1 text-sm font-medium">
                Prefixo do CEP
                <Input
                  value={zoneForm.postalCodePrefix}
                  onChange={event => setZoneForm(current => ({ ...current, postalCodePrefix: event.target.value }))}
                  placeholder="Ex: 01001"
                  required
                />
              </label>
            )}
            {zoneForm.type === 'RADIUS' && (
              <>
                <label className="space-y-1 text-sm font-medium">
                  Latitude da loja
                  <Input
                    value={zoneForm.centerLat}
                    onChange={event => setZoneForm(current => ({ ...current, centerLat: event.target.value }))}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Longitude da loja
                  <Input
                    value={zoneForm.centerLng}
                    onChange={event => setZoneForm(current => ({ ...current, centerLng: event.target.value }))}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Raio em km
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={zoneForm.radiusKm}
                    onChange={event => setZoneForm(current => ({ ...current, radiusKm: event.target.value }))}
                    required
                  />
                </label>
              </>
            )}
            <label className="space-y-1 text-sm font-medium">
              Frete grátis acima de
              <Input
                type="number"
                min="0"
                step="0.01"
                value={zoneForm.freeDeliveryMinimum}
                onChange={event => setZoneForm(current => ({ ...current, freeDeliveryMinimum: event.target.value }))}
                placeholder="Opcional"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Pedido mínimo da região
              <Input
                type="number"
                min="0"
                step="0.01"
                value={zoneForm.minimumOrderAmount}
                onChange={event => setZoneForm(current => ({ ...current, minimumOrderAmount: event.target.value }))}
                placeholder="Opcional"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Prioridade
              <Input
                type="number"
                min="0"
                max="999"
                value={zoneForm.priority}
                onChange={event => setZoneForm(current => ({ ...current, priority: event.target.value }))}
              />
            </label>
            <label className="flex items-end gap-2 text-sm font-medium">
              <Switch
                checked={zoneForm.isActive}
                onCheckedChange={checked => setZoneForm(current => ({ ...current, isActive: checked }))}
              />
              Região ativa
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" isLoading={isSavingZone}>
              <Plus className="size-4" />
              {zoneForm.id ? 'Salvar alteração' : 'Adicionar região'}
            </Button>
            {zoneForm.id && (
              <Button type="button" variant="outline" onClick={resetZoneForm}>
                Cancelar edição
              </Button>
            )}
          </div>
        </form>
      </SettingsCategoryBlock>

      <SettingsCategoryBlock title="Regiões cadastradas" contentClassName="grid-cols-1">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regra</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Taxa</TableHead>
                <TableHead>Pedido mínimo</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Carregando regras de entrega...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && data?.zones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhuma região cadastrada. Sem região, o cardápio assume taxa grátis e usa o prazo padrão.
                  </TableCell>
                </TableRow>
              )}
              {data?.zones.map(zone => (
                <TableRow key={zone.id}>
                  <TableCell>
                    <div className="font-medium">{zone.name}</div>
                    <div className="text-xs text-muted-foreground">{zoneTypeLabels[zone.type as ZoneType]}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3 text-primary" />
                      {getZoneAreaLabel(zone as Parameters<typeof getZoneAreaLabel>[0])}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>{money(zone.deliveryFee)}</div>
                    {zone.freeDeliveryMinimum && (
                      <div className="text-xs text-muted-foreground">
                        grátis acima de {money(zone.freeDeliveryMinimum)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{money(zone.minimumOrderAmount)}</TableCell>
                  <TableCell>{zone.estimatedDeliveryMinutes} min</TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        zone.isActive
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-muted bg-muted text-muted-foreground'
                      )}
                    >
                      {zone.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() =>
                          setZoneForm({
                            id: zone.id,
                            type: zone.type as ZoneType,
                            name: zone.name,
                            neighborhood: zone.neighborhood ?? '',
                            postalCodePrefix: zone.postalCodePrefix ?? '',
                            centerLat: zone.centerLat ?? '',
                            centerLng: zone.centerLng ?? '',
                            radiusKm: zone.radiusMeters ? String(zone.radiusMeters / 1000) : '',
                            deliveryFee: String(Number(zone.deliveryFee)),
                            freeDeliveryMinimum: zone.freeDeliveryMinimum
                              ? String(Number(zone.freeDeliveryMinimum))
                              : '',
                            minimumOrderAmount: zone.minimumOrderAmount
                              ? String(Number(zone.minimumOrderAmount))
                              : '',
                            estimatedDeliveryMinutes: String(zone.estimatedDeliveryMinutes),
                            priority: String(zone.priority),
                            isActive: zone.isActive,
                          })
                        }
                      >
                        <Edit3 className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        disabled={isDeletingZone}
                        onClick={() => deleteZone(zone.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SettingsCategoryBlock>
    </div>
  )
}
