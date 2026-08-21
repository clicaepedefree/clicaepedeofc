export const reportTimeZone = 'America/Sao_Paulo'
export const maxBoundedReportRangeDays = 366
export const maxAllTimeDailyBreakdownDays = 366

export const reportPeriodPresets = [
  {
    value: 'TODAY',
    label: 'Hoje',
    shortLabel: 'Hoje',
    description: 'Somente o dia atual no fuso da loja.',
  },
  {
    value: 'LAST_7_DAYS',
    label: 'Últimos 7 dias',
    shortLabel: '7 dias',
    description: 'Dia atual e os 6 dias anteriores.',
  },
  {
    value: 'THIS_MONTH',
    label: 'Este mês',
    shortLabel: 'Mês',
    description: 'Do primeiro dia do mês até hoje.',
  },
  {
    value: 'ALL_TIME',
    label: 'Todo período',
    shortLabel: 'Total',
    description: 'Todos os pedidos elegíveis da loja.',
  },
  {
    value: 'CUSTOM',
    label: 'Período personalizado',
    shortLabel: 'Período',
    description: 'Escolha início e fim com limite de 366 dias.',
  },
] as const

export type ReportPeriodPreset = (typeof reportPeriodPresets)[number]['value']

export type ReportPeriodSelection = {
  preset: ReportPeriodPreset
  customStartDate?: string
  customEndDate?: string
}

export type ResolvedReportPeriod = {
  preset: ReportPeriodPreset
  startDate?: string
  endDate?: string
  timeZone: string
  label: string
  isAllTime: boolean
  isCustom: boolean
  isRangeValid: boolean
  validationMessage?: string
}

type LocalDateParts = {
  year: number
  month: number
  day: number
}

export const isSupportedReportTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return true
  } catch {
    return false
  }
}

const getLocalDateParts = (date: Date, timeZone: string): LocalDateParts => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value)

  return {
    year: partValue('year'),
    month: partValue('month'),
    day: partValue('day'),
  }
}

const padDatePart = (value: number) => String(value).padStart(2, '0')

const toDateString = ({ year, month, day }: LocalDateParts) =>
  `${year}-${padDatePart(month)}-${padDatePart(day)}`

const parseDateString = (value: string): LocalDateParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) return null

  const [, year, month, day] = match
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  }
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))

  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return null
  }

  return parts
}

const toUtcDate = (value: string) => {
  const parsed = parseDateString(value)

  if (!parsed) return null

  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
}

const addDays = (dateString: string, amount: number) => {
  const date = toUtcDate(dateString)

  if (!date) return dateString

  date.setUTCDate(date.getUTCDate() + amount)

  return toDateString({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  })
}

const getInclusiveRangeDays = (startDate: string, endDate: string) => {
  const start = toUtcDate(startDate)
  const end = toUtcDate(endDate)

  if (!start || !end) return null

  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
}

const buildInvalidPeriod = (
  selection: ReportPeriodSelection,
  today: string,
  timeZone: string,
  validationMessage: string
): ResolvedReportPeriod => ({
  preset: selection.preset,
  startDate: selection.customStartDate || today,
  endDate: selection.customEndDate || today,
  timeZone,
  label: 'Período inválido',
  isAllTime: false,
  isCustom: selection.preset === 'CUSTOM',
  isRangeValid: false,
  validationMessage,
})

export const resolveReportPeriod = (
  selection: ReportPeriodSelection,
  now = new Date(),
  requestedTimeZone = reportTimeZone
): ResolvedReportPeriod => {
  const timeZone = isSupportedReportTimeZone(requestedTimeZone)
    ? requestedTimeZone
    : reportTimeZone
  const today = toDateString(getLocalDateParts(now, timeZone))
  const currentMonth = today.slice(0, 7)

  if (selection.preset === 'ALL_TIME') {
    return {
      preset: selection.preset,
      timeZone,
      label: 'Todo período',
      isAllTime: true,
      isCustom: false,
      isRangeValid: true,
    }
  }

  if (selection.preset === 'CUSTOM') {
    const startDate = selection.customStartDate
    const endDate = selection.customEndDate

    if (!startDate || !endDate) {
      return buildInvalidPeriod(
        selection,
        today,
        timeZone,
        'Informe início e fim para consultar um período personalizado.'
      )
    }

    const rangeDays = getInclusiveRangeDays(startDate, endDate)

    if (!rangeDays || rangeDays < 1) {
      return buildInvalidPeriod(
        selection,
        today,
        timeZone,
        'A data final precisa ser igual ou posterior à data inicial.'
      )
    }

    if (rangeDays > maxBoundedReportRangeDays) {
      return buildInvalidPeriod(
        selection,
        today,
        timeZone,
        `O período personalizado pode ter no máximo ${maxBoundedReportRangeDays} dias.`
      )
    }

    return {
      preset: selection.preset,
      startDate,
      endDate,
      timeZone,
      label: `${startDate} até ${endDate}`,
      isAllTime: false,
      isCustom: true,
      isRangeValid: true,
    }
  }

  const startDateByPreset: Record<
    Exclude<ReportPeriodPreset, 'ALL_TIME' | 'CUSTOM'>,
    string
  > = {
    TODAY: today,
    LAST_7_DAYS: addDays(today, -6),
    THIS_MONTH: `${currentMonth}-01`,
  }

  return {
    preset: selection.preset,
    startDate: startDateByPreset[selection.preset],
    endDate: today,
    timeZone,
    label:
      reportPeriodPresets.find(preset => preset.value === selection.preset)
        ?.label ?? 'Período',
    isAllTime: false,
    isCustom: false,
    isRangeValid: true,
  }
}

export const ensureValidReportRange = (
  startDate?: string,
  endDate?: string
) => {
  if (!startDate && !endDate) return

  if (!startDate || !endDate) {
    throw new Error('REPORT_PERIOD_RANGE_INCOMPLETE')
  }

  const rangeDays = getInclusiveRangeDays(startDate, endDate)

  if (!rangeDays || rangeDays < 1) {
    throw new Error('REPORT_PERIOD_RANGE_INVALID')
  }

  if (rangeDays > maxBoundedReportRangeDays) {
    throw new Error('REPORT_PERIOD_RANGE_TOO_LONG')
  }
}
