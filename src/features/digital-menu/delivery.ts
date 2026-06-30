import Decimal from 'decimal.js'
import { DigitalMenuDeliveryZone, DigitalMenuSettings } from './types'

export const normalizeComparableText = (value: string | null | undefined) => {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const normalizePostalCode = (value: string | null | undefined) => {
  return (value ?? '').replace(/\D/g, '')
}

export const metersBetweenCoordinates = ({
  fromLatitude,
  fromLongitude,
  toLatitude,
  toLongitude,
}: {
  fromLatitude: number
  fromLongitude: number
  toLatitude: number
  toLongitude: number
}) => {
  const earthRadiusMeters = 6371000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latDelta = toRadians(toLatitude - fromLatitude)
  const lngDelta = toRadians(toLongitude - fromLongitude)
  const fromLat = toRadians(fromLatitude)
  const toLat = toRadians(toLatitude)

  const haversine =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2)

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

const getMinimumOrderAmount = ({
  zone,
  settings,
}: {
  zone: DigitalMenuDeliveryZone
  settings: DigitalMenuSettings
}) => zone.minimumOrderAmount ?? settings.minimumOrderAmount

const buildQuote = ({
  zone,
  subtotal,
  settings,
}: {
  zone: DigitalMenuDeliveryZone
  subtotal: string
  settings: DigitalMenuSettings
}) => {
  const subtotalAsDecimal = new Decimal(subtotal)
  const hasFreeDelivery =
    zone.freeDeliveryMinimum &&
    subtotalAsDecimal.greaterThanOrEqualTo(zone.freeDeliveryMinimum)

  return {
    deliveryFee: hasFreeDelivery ? '0' : zone.deliveryFee,
    minimumOrderAmount: getMinimumOrderAmount({ zone, settings }),
    deliveryZoneId: zone.id,
    deliveryEstimatedMinutes: zone.estimatedDeliveryMinutes,
    deliveryZoneSnapshot: zone,
  }
}

export const quoteDigitalMenuDelivery = ({
  zones,
  neighborhood,
  postalCode,
  customerLatitude,
  customerLongitude,
  subtotal,
  settings,
}: {
  zones: DigitalMenuDeliveryZone[]
  neighborhood?: string
  postalCode?: string
  customerLatitude?: number
  customerLongitude?: number
  subtotal: string
  settings: DigitalMenuSettings
}) => {
  if (zones.length === 0) {
    throw new Error('A loja ainda nao configurou uma area de entrega.')
  }

  const activeZones = zones
    .filter(zone => zone.isActive)
    .sort((a, b) => b.priority - a.priority)
  const normalizedNeighborhood = normalizeComparableText(neighborhood)
  const normalizedPostalCode = normalizePostalCode(postalCode)
  let needsCustomerLocation = false

  for (const zone of activeZones) {
    if (zone.type === 'FIXED') {
      return buildQuote({ zone, subtotal, settings })
    }

    if (
      zone.type === 'NEIGHBORHOOD' &&
      normalizedNeighborhood &&
      normalizeComparableText(zone.neighborhood || zone.name) === normalizedNeighborhood
    ) {
      return buildQuote({ zone, subtotal, settings })
    }

    if (
      zone.type === 'POSTAL_CODE' &&
      normalizedPostalCode &&
      !!zone.postalCodePrefix &&
      normalizedPostalCode.startsWith(normalizePostalCode(zone.postalCodePrefix))
    ) {
      return buildQuote({ zone, subtotal, settings })
    }

    if (
      zone.type !== 'RADIUS' ||
      zone.centerLat === null ||
      zone.centerLng === null ||
      zone.radiusMeters === null
    ) {
      continue
    }

    if (customerLatitude === undefined || customerLongitude === undefined) {
      needsCustomerLocation = true
      continue
    }

    const distanceMeters = metersBetweenCoordinates({
      fromLatitude: Number(zone.centerLat),
      fromLongitude: Number(zone.centerLng),
      toLatitude: customerLatitude,
      toLongitude: customerLongitude,
    })

    if (distanceMeters <= zone.radiusMeters) {
      return buildQuote({ zone, subtotal, settings })
    }
  }

  if (needsCustomerLocation) {
    throw new Error('Compartilhe sua localizacao para calcular a entrega.')
  }

  throw new Error('Ainda nao entregamos neste endereco.')
}
