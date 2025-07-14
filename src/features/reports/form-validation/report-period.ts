export const reportPeriodsOptions = [
  {
    value: 'TODAY',
    label: 'Hoje',
  },
  {
    value: 'YESTERDAY',
    label: 'Ontem',
  },
  {
    value: 'LAST_7_DAYS',
    label: 'Últimos 7 dias',
  },
  {
    value: 'LAST_15_DAYS',
    label: 'Últimos 15 dias',
  },
  {
    value: 'LAST_30_DAYS',
    label: 'Últimos 30 dias',
  },
  {
    value: 'LAST_60_DAYS',
    label: 'Últimos 60 dias',
  },
  {
    value: 'LAST_90_DAYS',
    label: 'Últimos 90 dias',
  },
  {
    value: 'THIS_WEEK',
    label: 'Esta semana',
  },
  {
    value: 'LAST_WEEK',
    label: 'Semana passada',
  },
  {
    value: 'THIS_MONTH',
    label: 'Este mês',
  },
  {
    value: 'LAST_MONTH',
    label: 'Mês passado',
  },
  {
    value: 'THIS_YEAR',
    label: 'Este ano',
  },
] as const

export type ReportPeriod = (typeof reportPeriodsOptions)[number]['value']
