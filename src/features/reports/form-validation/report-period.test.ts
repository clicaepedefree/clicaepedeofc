import { describe, expect, test } from 'bun:test'

import {
  ensureValidReportRange,
  maxBoundedReportRangeDays,
  reportTimeZone,
  resolveReportPeriod,
} from './report-period'

describe('report period filters', () => {
  const fixedNow = new Date('2026-08-21T15:30:00.000Z')

  test('resolves shortcuts using the store operational timezone', () => {
    expect(resolveReportPeriod({ preset: 'TODAY' }, fixedNow)).toMatchObject({
      startDate: '2026-08-21',
      endDate: '2026-08-21',
      timeZone: reportTimeZone,
    })
    expect(
      resolveReportPeriod({ preset: 'LAST_7_DAYS' }, fixedNow)
    ).toMatchObject({
      startDate: '2026-08-15',
      endDate: '2026-08-21',
    })
    expect(resolveReportPeriod({ preset: 'THIS_MONTH' }, fixedNow)).toMatchObject(
      {
        startDate: '2026-08-01',
        endDate: '2026-08-21',
      }
    )
  })

  test('uses Sao Paulo day when UTC already crossed midnight', () => {
    const utcAfterMidnight = new Date('2026-08-22T02:30:00.000Z')

    expect(resolveReportPeriod({ preset: 'TODAY' }, utcAfterMidnight)).toMatchObject(
      {
        startDate: '2026-08-21',
        endDate: '2026-08-21',
      }
    )
  })

  test('resolves shortcuts with the provided store timezone', () => {
    const utcAfternoon = new Date('2026-08-21T15:30:00.000Z')

    expect(
      resolveReportPeriod({ preset: 'TODAY' }, utcAfternoon, 'Asia/Tokyo')
    ).toMatchObject({
      startDate: '2026-08-22',
      endDate: '2026-08-22',
      timeZone: 'Asia/Tokyo',
    })
  })

  test('allows all time without synthetic start and end dates', () => {
    const result = resolveReportPeriod({ preset: 'ALL_TIME' }, fixedNow)

    expect(result.isAllTime).toBe(true)
    expect(result.startDate).toBeUndefined()
    expect(result.endDate).toBeUndefined()
    expect(result.isRangeValid).toBe(true)
  })

  test('validates custom periods before querying', () => {
    expect(
      resolveReportPeriod(
        {
          preset: 'CUSTOM',
          customStartDate: '2026-08-01',
          customEndDate: '2026-08-31',
        },
        fixedNow
      )
    ).toMatchObject({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      isRangeValid: true,
    })

    expect(
      resolveReportPeriod(
        {
          preset: 'CUSTOM',
          customStartDate: '2026-09-01',
          customEndDate: '2026-08-31',
        },
        fixedNow
      )
    ).toMatchObject({
      isRangeValid: false,
    })
  })

  test('rejects bounded reports above the maximum range', () => {
    expect(() =>
      ensureValidReportRange('2026-01-01', '2027-01-02')
    ).toThrow('REPORT_PERIOD_RANGE_TOO_LONG')

    expect(
      resolveReportPeriod(
        {
          preset: 'CUSTOM',
          customStartDate: '2026-01-01',
          customEndDate: '2027-01-02',
        },
        fixedNow
      ).validationMessage
    ).toContain(`${maxBoundedReportRangeDays} dias`)
  })
})
