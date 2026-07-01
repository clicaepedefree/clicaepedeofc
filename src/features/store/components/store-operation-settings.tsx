'use client'

import { useStoreOperationConfiguration } from '@/features/store/hooks/use-store-operation-configuration'
import { Badge } from '@/shared/badge'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { SingleFileUploader } from '@/shared/file-upload'
import { Input } from '@/shared/input'
import { Switch } from '@/shared/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { CalendarClock, Clock3, ImageIcon, Phone, Power, Save, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'

type OperationalStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'PAUSED'
  | 'TAKEOUT_ONLY'
  | 'DELIVERY_ONLY'
type ServiceType = 'ALL' | 'DELIVERY' | 'TAKEOUT'

const weekdays = [
  'Domingo',
  'Segunda',
  'Terca',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sabado',
]

const statusLabels: Record<OperationalStatus, string> = {
  OPEN: 'Aberta',
  CLOSED: 'Fechada',
  PAUSED: 'Pausada',
  TAKEOUT_ONLY: 'Apenas retirada',
  DELIVERY_ONLY: 'Apenas delivery',
}

const serviceLabels: Record<ServiceType, string> = {
  ALL: 'Delivery e retirada',
  DELIVERY: 'Apenas delivery',
  TAKEOUT: 'Apenas retirada',
}

const emptyBusinessHour = {
  weekday: '1',
  opensAt: '11:00',
  closesAt: '15:00',
  serviceType: 'ALL' as ServiceType,
  isActive: true,
}

const emptySpecialHour = {
  date: '',
  reason: '',
  isClosed: true,
  opensAt: '11:00',
  closesAt: '15:00',
  serviceType: 'ALL' as ServiceType,
}

export const StoreOperationSettings = () => {
  const {
    selectedStoreId,
    data,
    isLoading,
    saveSettings,
    savePublicProfile,
    saveBusinessHour,
    saveSpecialHour,
    deleteBusinessHour,
    deleteSpecialHour,
    isSavingSettings,
    isSavingPublicProfile,
    isSavingBusinessHour,
    isSavingSpecialHour,
    isDeletingBusinessHour,
    isDeletingSpecialHour,
  } = useStoreOperationConfiguration()

  const [isDigitalMenuEnabled, setIsDigitalMenuEnabled] = useState(true)
  const [storeName, setStoreName] = useState('')
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [logoFile, setLogoFile] = useState<{ id: number; url: string } | null>(null)
  const [bannerFile, setBannerFile] = useState<{ id: number; url: string } | null>(null)
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true)
  const [operationalStatus, setOperationalStatus] =
    useState<OperationalStatus>('OPEN')
  const [operationalStatusMessage, setOperationalStatusMessage] = useState('')
  const [allowScheduledOrders, setAllowScheduledOrders] = useState(false)
  const [allowItemObservations, setAllowItemObservations] = useState(true)
  const [scheduleMinLeadMinutes, setScheduleMinLeadMinutes] = useState('30')
  const [scheduleMaxDaysAhead, setScheduleMaxDaysAhead] = useState('7')
  const [businessHourForm, setBusinessHourForm] = useState(emptyBusinessHour)
  const [specialHourForm, setSpecialHourForm] = useState(emptySpecialHour)

  useEffect(() => {
    if (!data?.settings) return
    setStoreName(data.settings.storeName)
    setWhatsappPhone(data.settings.whatsappPhone ?? '')
    setLogoFile(
      data.settings.logoFileId && data.settings.logoUrl
        ? { id: data.settings.logoFileId, url: data.settings.logoUrl }
        : null
    )
    setBannerFile(
      data.settings.bannerFileId && data.settings.bannerUrl
        ? { id: data.settings.bannerFileId, url: data.settings.bannerUrl }
        : null
    )
    setIsDigitalMenuEnabled(data.settings.isDigitalMenuEnabled)
    setIsAcceptingOrders(data.settings.isAcceptingOrders)
    setOperationalStatus(data.settings.operationalStatus as OperationalStatus)
    setOperationalStatusMessage(
      data.settings.operationalStatusMessage ||
        data.settings.manualPauseReason ||
        ''
    )
    setAllowScheduledOrders(data.settings.allowScheduledOrders)
    setAllowItemObservations(data.settings.allowItemObservations ?? true)
    setScheduleMinLeadMinutes(String(data.settings.scheduleMinLeadMinutes))
    setScheduleMaxDaysAhead(String(data.settings.scheduleMaxDaysAhead))
  }, [data?.settings])

  const groupedHours = useMemo(() => {
    return weekdays.map((weekday, weekdayIndex) => ({
      weekday,
      hours:
        data?.businessHours.filter(hour => hour.weekday === weekdayIndex) ?? [],
    }))
  }, [data?.businessHours])

  if (!selectedStoreId) {
    return (
      <SettingsCategoryBlock title="Funcionamento do cardapio digital" contentClassName="grid-cols-1">
        <p className="text-sm text-muted-foreground">
          Selecione uma loja para configurar funcionamento e horarios.
        </p>
      </SettingsCategoryBlock>
    )
  }

  const submitSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveSettings({
      isDigitalMenuEnabled,
      isAcceptingOrders,
      operationalStatus,
      operationalStatusMessage,
      allowScheduledOrders,
      scheduleMinLeadMinutes: Number(scheduleMinLeadMinutes),
      scheduleMaxDaysAhead: Number(scheduleMaxDaysAhead),
      allowItemObservations,
    })
  }

  const submitPublicProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    savePublicProfile({
      storeName,
      whatsappPhone,
      logoFileId: logoFile?.id ?? null,
      bannerFileId: bannerFile?.id ?? null,
    })
  }

  const submitBusinessHour = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveBusinessHour({
      weekday: Number(businessHourForm.weekday),
      opensAt: businessHourForm.opensAt,
      closesAt: businessHourForm.closesAt,
      serviceType: businessHourForm.serviceType,
      isActive: businessHourForm.isActive,
    })
  }

  const submitSpecialHour = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveSpecialHour({
      date: specialHourForm.date,
      reason: specialHourForm.reason,
      isClosed: specialHourForm.isClosed,
      opensAt: specialHourForm.isClosed ? null : specialHourForm.opensAt,
      closesAt: specialHourForm.isClosed ? null : specialHourForm.closesAt,
      serviceType: specialHourForm.serviceType,
    })
  }

  return (
    <div className="space-y-4">
      <SettingsCategoryBlock id="digital-menu-identity" title="Identidade publica do cardapio" contentClassName="grid-cols-1">
        <form onSubmit={submitPublicProfile} className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ImageIcon className="size-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Vitrine do cliente</h2>
                <p className="text-sm text-muted-foreground">
                  Nome, contato e imagens usados no cardapio publico da loja.
                </p>
              </div>
            </div>
            <Button className="self-start" type="submit" isLoading={isSavingPublicProfile}>
              <Save className="size-4" />
              Salvar identidade
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Nome da loja
              <Input
                value={storeName}
                onChange={event => setStoreName(event.target.value)}
                placeholder="Ex: Clica e Pede Restaurante"
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              WhatsApp do cardapio
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={whatsappPhone}
                  onChange={event => setWhatsappPhone(event.target.value)}
                  placeholder="Ex: 11999999999"
                  inputMode="tel"
                />
              </div>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div>
              <p className="mb-2 text-sm font-medium">Logo</p>
              <SingleFileUploader
                storeId={selectedStoreId}
                fileUrl={logoFile?.url}
                fileTag="digital-menu-logo"
                onFileUploaded={file =>
                  setLogoFile({
                    id: file.serverData.id,
                    url: file.serverData.url,
                  })
                }
                onFileDeleted={() => setLogoFile(null)}
                enableCropper
                cropperAspectRatio={1}
                className="m-0 min-h-48"
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Banner</p>
              <SingleFileUploader
                storeId={selectedStoreId}
                fileUrl={bannerFile?.url}
                fileTag="digital-menu-banner"
                onFileUploaded={file =>
                  setBannerFile({
                    id: file.serverData.id,
                    url: file.serverData.url,
                  })
                }
                onFileDeleted={() => setBannerFile(null)}
                enableCropper
                cropperAspectRatio={16 / 7}
                className="m-0 min-h-48"
              />
            </div>
          </div>
        </form>
      </SettingsCategoryBlock>

      <SettingsCategoryBlock title="Funcionamento do cardapio digital" contentClassName="grid-cols-1">
        <form onSubmit={submitSettings} className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Power className="size-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Status operacional</h2>
                <p className="text-sm text-muted-foreground">
                  Controla se o cliente pode finalizar pedido agora ou agendar.
                </p>
              </div>
            </div>
            <Badge className="w-fit border-primary/20 bg-primary/10 text-primary">
              {statusLabels[operationalStatus]}
            </Badge>
          </div>

          <div className="grid gap-3 lg:grid-cols-[220px_1fr_1fr]">
            <label className="space-y-1 text-sm font-medium">
              Status manual
              <select
                className="h-9 w-full rounded border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-primary/20 focus-visible:ring-[3px]"
                value={operationalStatus}
                onChange={event =>
                  setOperationalStatus(event.target.value as OperationalStatus)
                }
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Mensagem personalizada
              <Input
                value={operationalStatusMessage}
                onChange={event => setOperationalStatusMessage(event.target.value)}
                placeholder="Ex: Pausamos por alta demanda."
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-1">
              <label className="flex items-end gap-2 text-sm font-medium">
                <Switch
                  checked={isAcceptingOrders}
                  onCheckedChange={setIsAcceptingOrders}
                />
                Aceitar pedidos
              </label>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border bg-background p-4 lg:grid-cols-[1fr_160px_160px_auto]">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch
                  checked={allowScheduledOrders}
                  onCheckedChange={setAllowScheduledOrders}
                />
                Permitir pedidos agendados
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch
                  checked={allowItemObservations}
                  onCheckedChange={setAllowItemObservations}
                />
                Permitir observacao nos itens
              </label>
            </div>
            <label className="space-y-1 text-sm font-medium">
              Min. antecedencia
              <Input
                type="number"
                min="0"
                value={scheduleMinLeadMinutes}
                onChange={event => setScheduleMinLeadMinutes(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Max. dias
              <Input
                type="number"
                min="0"
                max="90"
                value={scheduleMaxDaysAhead}
                onChange={event => setScheduleMaxDaysAhead(event.target.value)}
              />
            </label>
            <Button className="self-end" type="submit" isLoading={isSavingSettings}>
              <Save className="size-4" />
              Salvar
            </Button>
          </div>
        </form>
      </SettingsCategoryBlock>

      <SettingsCategoryBlock id="digital-menu-hours" title="Horarios semanais" contentClassName="grid-cols-1">
        <form onSubmit={submitBusinessHour} className="grid gap-3 rounded-lg border bg-background p-4 lg:grid-cols-[150px_140px_140px_190px_1fr_auto]">
          <label className="space-y-1 text-sm font-medium">
            Dia
            <select
              className="h-9 w-full rounded border border-input bg-background px-3 text-sm"
              value={businessHourForm.weekday}
              onChange={event =>
                setBusinessHourForm(current => ({ ...current, weekday: event.target.value }))
              }
            >
              {weekdays.map((weekday, index) => (
                <option key={weekday} value={index}>
                  {weekday}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Abre
            <Input
              type="time"
              value={businessHourForm.opensAt}
              onChange={event =>
                setBusinessHourForm(current => ({ ...current, opensAt: event.target.value }))
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Fecha
            <Input
              type="time"
              value={businessHourForm.closesAt}
              onChange={event =>
                setBusinessHourForm(current => ({ ...current, closesAt: event.target.value }))
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Tipo
            <select
              className="h-9 w-full rounded border border-input bg-background px-3 text-sm"
              value={businessHourForm.serviceType}
              onChange={event =>
                setBusinessHourForm(current => ({
                  ...current,
                  serviceType: event.target.value as ServiceType,
                }))
              }
            >
              {Object.entries(serviceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 text-sm font-medium">
            <Switch
              checked={businessHourForm.isActive}
              onCheckedChange={checked =>
                setBusinessHourForm(current => ({ ...current, isActive: checked }))
              }
            />
            Ativo
          </label>
          <Button className="self-end" type="submit" isLoading={isSavingBusinessHour}>
            <Clock3 className="size-4" />
            Adicionar
          </Button>
        </form>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {groupedHours.map(group => (
            <div key={group.weekday} className="rounded-lg border bg-background p-3">
              <h3 className="font-medium">{group.weekday}</h3>
              <div className="mt-3 space-y-2">
                {group.hours.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sem horario definido.</p>
                )}
                {group.hours.map(hour => (
                  <div key={hour.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">
                        {hour.opensAt.slice(0, 5)} - {hour.closesAt.slice(0, 5)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {serviceLabels[hour.serviceType as ServiceType]} - {hour.isActive ? 'ativo' : 'inativo'}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={isDeletingBusinessHour}
                      onClick={() => deleteBusinessHour(hour.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsCategoryBlock>

      <SettingsCategoryBlock title="Datas especiais e feriados" contentClassName="grid-cols-1">
        <form onSubmit={submitSpecialHour} className="grid gap-3 rounded-lg border bg-background p-4 lg:grid-cols-[160px_1fr_190px_140px_140px_auto]">
          <label className="space-y-1 text-sm font-medium">
            Data
            <Input
              type="date"
              value={specialHourForm.date}
              onChange={event =>
                setSpecialHourForm(current => ({ ...current, date: event.target.value }))
              }
              required
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Motivo
            <Input
              value={specialHourForm.reason}
              onChange={event =>
                setSpecialHourForm(current => ({ ...current, reason: event.target.value }))
              }
              placeholder="Ex: Feriado"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Tipo
            <select
              className="h-9 w-full rounded border border-input bg-background px-3 text-sm"
              value={specialHourForm.serviceType}
              onChange={event =>
                setSpecialHourForm(current => ({
                  ...current,
                  serviceType: event.target.value as ServiceType,
                }))
              }
            >
              {Object.entries(serviceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Abre
            <Input
              type="time"
              disabled={specialHourForm.isClosed}
              value={specialHourForm.opensAt}
              onChange={event =>
                setSpecialHourForm(current => ({ ...current, opensAt: event.target.value }))
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Fecha
            <Input
              type="time"
              disabled={specialHourForm.isClosed}
              value={specialHourForm.closesAt}
              onChange={event =>
                setSpecialHourForm(current => ({ ...current, closesAt: event.target.value }))
              }
            />
          </label>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch
                checked={specialHourForm.isClosed}
                onCheckedChange={checked =>
                  setSpecialHourForm(current => ({ ...current, isClosed: checked }))
                }
              />
              Fechado
            </label>
            <Button type="submit" isLoading={isSavingSpecialHour}>
              <CalendarClock className="size-4" />
              Salvar
            </Button>
          </div>
        </form>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Carregando datas especiais...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && data?.specialHours.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhuma data especial cadastrada.
                  </TableCell>
                </TableRow>
              )}
              {data?.specialHours.map(hour => (
                <TableRow key={hour.id}>
                  <TableCell>{hour.date}</TableCell>
                  <TableCell>{hour.reason || '-'}</TableCell>
                  <TableCell>{serviceLabels[hour.serviceType as ServiceType]}</TableCell>
                  <TableCell>
                    {hour.isClosed
                      ? 'Fechado'
                      : `${hour.opensAt?.slice(0, 5)} - ${hour.closesAt?.slice(0, 5)}`}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={isDeletingSpecialHour}
                      onClick={() => deleteSpecialHour(hour.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
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
