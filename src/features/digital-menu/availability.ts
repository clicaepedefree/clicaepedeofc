export type DigitalMenuServiceType = 'DELIVERY' | 'TAKEOUT'

export type DigitalMenuOperationalStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'PAUSED'
  | 'TAKEOUT_ONLY'
  | 'DELIVERY_ONLY'

export type DigitalMenuAvailabilitySettings = {
  isDigitalMenuEnabled: boolean
  isAcceptingOrders: boolean
  operationalStatus: DigitalMenuOperationalStatus
  operationalStatusMessage: string | null
  manualPauseReason: string | null
  manualPauseUntil: Date | null
  allowScheduledOrders: boolean
}

export type DigitalMenuBusinessHour = {
  weekday: number
  opensAt: string
  closesAt: string
  serviceType: DigitalMenuServiceType | 'ALL'
  isActive: boolean
}

export type DigitalMenuSpecialHour = {
  date: string
  reason: string | null
  isClosed: boolean
  opensAt: string | null
  closesAt: string | null
  serviceType: DigitalMenuServiceType | 'ALL'
}

export type DigitalMenuAvailabilityResult = {
  isOpen: boolean
  reason: string | null
  nextOpeningLabel: string | null
  canSchedule: boolean
  statusLabel: string
}

export const formatSaoPauloDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  return {
    weekday: weekdayMap[byType.weekday] ?? 0,
    date: `${byType.year}-${byType.month}-${byType.day}`,
    time: `${byType.hour}:${byType.minute}:00`,
  }
}

export const timeIsBetween = (time: string, opensAt: string, closesAt: string) =>
  time >= opensAt && time <= closesAt

const serviceTypeMatches = (
  current: DigitalMenuServiceType | 'ALL',
  requested: DigitalMenuServiceType
) => current === 'ALL' || current === requested

const buildClosedResult = ({
  reason,
  settings,
  canSchedule = false,
  nextOpeningLabel = null,
  statusLabel = 'Fechada',
}: {
  reason: string
  settings: DigitalMenuAvailabilitySettings
  canSchedule?: boolean
  nextOpeningLabel?: string | null
  statusLabel?: string
}): DigitalMenuAvailabilityResult => ({
  isOpen: false,
  reason,
  nextOpeningLabel,
  canSchedule: settings.allowScheduledOrders && canSchedule,
  statusLabel,
})

export const evaluateDigitalMenuAvailability = ({
  settings,
  businessHours,
  specialHours,
  serviceType,
  now = new Date(),
}: {
  settings: DigitalMenuAvailabilitySettings
  businessHours: DigitalMenuBusinessHour[]
  specialHours: DigitalMenuSpecialHour[]
  serviceType: DigitalMenuServiceType
  now?: Date
}): DigitalMenuAvailabilityResult => {
  if (!settings.isDigitalMenuEnabled) {
    return buildClosedResult({
      reason: 'Cardapio digital desativado para esta loja.',
      settings,
      statusLabel: 'Cardapio desativado',
    })
  }

  const statusMessage = settings.operationalStatusMessage || settings.manualPauseReason

  if (!settings.isAcceptingOrders) {
    return buildClosedResult({
      reason: statusMessage || 'A loja pausou novos pedidos.',
      settings,
      statusLabel: 'Pausada',
    })
  }

  if (
    settings.manualPauseUntil &&
    settings.manualPauseUntil.getTime() > now.getTime()
  ) {
    return buildClosedResult({
      reason: statusMessage || 'A loja pausou novos pedidos.',
      settings,
      statusLabel: 'Pausada',
    })
  }

  if (settings.operationalStatus === 'CLOSED') {
    return buildClosedResult({
      reason: statusMessage || 'A loja esta fechada no momento.',
      settings,
      statusLabel: 'Fechada',
    })
  }

  if (settings.operationalStatus === 'PAUSED') {
    return buildClosedResult({
      reason: statusMessage || 'A loja pausou novos pedidos.',
      settings,
      statusLabel: 'Pausada',
    })
  }

  if (
    settings.operationalStatus === 'TAKEOUT_ONLY' &&
    serviceType === 'DELIVERY'
  ) {
    return buildClosedResult({
      reason: statusMessage || 'A loja esta aceitando apenas retirada.',
      settings,
      statusLabel: 'Apenas retirada',
    })
  }

  if (
    settings.operationalStatus === 'DELIVERY_ONLY' &&
    serviceType === 'TAKEOUT'
  ) {
    return buildClosedResult({
      reason: statusMessage || 'A loja esta aceitando apenas delivery.',
      settings,
      statusLabel: 'Apenas delivery',
    })
  }

  const current = formatSaoPauloDateParts(now)
  const matchingSpecialHours = specialHours.filter(
    hour => hour.date === current.date && serviceTypeMatches(hour.serviceType, serviceType)
  )

  if (matchingSpecialHours.some(hour => hour.isClosed)) {
    return buildClosedResult({
      reason:
        matchingSpecialHours.find(hour => hour.isClosed)?.reason ||
        'A loja esta fechada hoje.',
      settings,
      canSchedule: true,
      statusLabel: 'Fechada hoje',
    })
  }

  if (matchingSpecialHours.length > 0) {
    const specialWindowIsOpen = matchingSpecialHours.some(
      hour =>
        !!hour.opensAt &&
        !!hour.closesAt &&
        timeIsBetween(current.time, hour.opensAt, hour.closesAt)
    )

    if (specialWindowIsOpen) {
      return {
        isOpen: true,
        reason: null,
        nextOpeningLabel: null,
        canSchedule: settings.allowScheduledOrders,
        statusLabel: 'Aberta',
      }
    }

    return buildClosedResult({
      reason:
        matchingSpecialHours[0]?.reason ||
        'A loja esta fora do horario especial de atendimento.',
      settings,
      canSchedule: true,
      statusLabel: 'Fora do horario',
    })
  }

  const todayBusinessHours = businessHours
    .filter(
      hour =>
        hour.weekday === current.weekday &&
        hour.isActive &&
        serviceTypeMatches(hour.serviceType, serviceType)
    )
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt))

  if (todayBusinessHours.length === 0) {
    return buildClosedResult({
      reason: 'A loja ainda nao configurou horarios para este tipo de pedido.',
      settings,
      statusLabel: 'Horarios indisponiveis',
    })
  }

  const currentWindow = todayBusinessHours.find(hour =>
    timeIsBetween(current.time, hour.opensAt, hour.closesAt)
  )

  if (currentWindow) {
    return {
      isOpen: true,
      reason: null,
      nextOpeningLabel: null,
      canSchedule: settings.allowScheduledOrders,
      statusLabel: 'Aberta',
    }
  }

  return buildClosedResult({
    reason: 'A loja esta fora do horario de atendimento.',
    settings,
    canSchedule: true,
    nextOpeningLabel: todayBusinessHours[0]
      ? `Abre as ${todayBusinessHours[0].opensAt.slice(0, 5)}`
      : null,
    statusLabel: 'Fora do horario',
  })
}
