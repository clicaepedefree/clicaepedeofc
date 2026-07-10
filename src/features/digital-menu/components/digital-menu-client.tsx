'use client'

import {
  quoteDigitalMenuCoupon,
  submitDigitalMenuOrder,
} from '@/features/digital-menu/api'
import { quoteDigitalMenuDelivery } from '@/features/digital-menu/delivery'
import {
  buildDigitalMenuDraftStorageKey,
  parseDigitalMenuDraft,
  shouldPersistDigitalMenuDraft,
  type DigitalMenuDraftCartItem,
  type DigitalMenuDraftCartOption,
  type DigitalMenuDraftState,
} from '@/features/digital-menu/draft-storage'
import {
  normalizeCouponCode,
  quoteDigitalMenuPromotion,
} from '@/features/digital-menu/promotions'
import { isValidCpf } from '@/features/digital-menu/validation'
import {
  DigitalMenuCategory,
  DigitalMenuAvailability,
  DigitalMenuData,
  DigitalMenuItem,
  DigitalMenuOptionGroup,
  DigitalMenuSubmitInput,
} from '@/features/digital-menu/types'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/sheet'
import { Input } from '@/shared/input'
import { Textarea } from '@/shared/textarea'
import { cn } from '@/shared/lib/utils'
import {
  CheckCircle2,
  Clock3,
  Copy,
  HandPlatter,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Trash2,
  Truck,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import Script from 'next/script'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'

type CartOption = DigitalMenuDraftCartOption
type CartItem = DigitalMenuDraftCartItem

type MenuFilter = 'ALL' | 'RECOMMENDED' | 'WITH_IMAGE' | 'PROMO'

type DisplayMenuItem = DigitalMenuItem & {
  categoryName: string
  isRecommended: boolean
}

type DisplayMenuCategory = Omit<DigitalMenuCategory, 'items'> & {
  items: DisplayMenuItem[]
}

type TurnstileApi = {
  render: (container: string, options: Record<string, unknown>) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const ConditionalTurnstile = ({
  siteKey,
  resetKey,
  onToken,
  onError,
}: {
  siteKey: string
  resetKey: number
  onToken: (token: string | null) => void
  onError: (message: string) => void
}) => {
  const containerId = `turnstile-${useId().replace(/:/g, '')}`
  const widgetId = useRef<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    if (!scriptReady || !window.turnstile) return
    if (widgetId.current) window.turnstile.remove(widgetId.current)
    widgetId.current = window.turnstile.render(`#${containerId}`, {
      sitekey: siteKey,
      action: 'digital_menu_checkout',
      theme: 'auto',
      size: 'flexible',
      appearance: 'interaction-only',
      callback: (token: string) => onToken(token),
      'expired-callback': () => {
        onToken(null)
        onError('A verificacao expirou. Faca novamente para enviar o pedido.')
      },
      'error-callback': () => {
        onToken(null)
        onError(
          'Nao foi possivel carregar a verificacao. Confira sua conexao e tente novamente.'
        )
      },
    })
    return () => {
      if (widgetId.current && window.turnstile)
        window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [containerId, onError, onToken, resetKey, scriptReady, siteKey])

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div id={containerId} className="min-h-16 w-full overflow-hidden" />
    </>
  )
}

const currency = (value: string | number) =>
  formatValueToCurrency({ value, includeCurrencySymbol: true })

const getItemUnitTotal = (item: CartItem) => {
  const optionsTotal = item.options.reduce(
    (total, option) => total + Number(option.price) * option.quantity,
    0
  )

  return Number(item.price) + optionsTotal
}

const createIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const toDatetimeLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const parseScheduledDate = (value: string) => {
  if (!value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const isItemUnavailable = (item: DigitalMenuItem) =>
  item.inventory !== null && item.inventory <= 0

const formatPickupAddress = (
  address: DigitalMenuData['settings']['pickupAddress']
) => {
  if (!address) return null

  return [
    [address.street, address.number].filter(Boolean).join(', '),
    address.district,
    [address.city, address.stateCode].filter(Boolean).join(' - '),
  ]
    .filter(Boolean)
    .join(' · ')
}

export const DigitalMenuClient = ({
  menu,
  previewMode = false,
}: {
  menu: DigitalMenuData
  previewMode?: boolean
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    menu.categories[0]?.id
  )
  const [selectedItem, setSelectedItem] = useState<DigitalMenuItem | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<MenuFilter>('ALL')
  const [selectedOptions, setSelectedOptions] = useState<
    Record<number, number>
  >({})
  const [editingCartId, setEditingCartId] = useState<string | null>(null)
  const [itemComment, setItemComment] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerDocument, setCustomerDocument] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [complement, setComplement] = useState('')
  const [reference, setReference] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [customerLatitude, setCustomerLatitude] = useState<number | undefined>()
  const [customerLongitude, setCustomerLongitude] = useState<
    number | undefined
  >()
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [orderType, setOrderType] =
    useState<DigitalMenuSubmitInput['orderType']>('DELIVERY')
  const [scheduledFor, setScheduledFor] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<
    DigitalMenuSubmitInput['payment']['method']
  >(menu.paymentMethods[0]?.method ?? 'PIX')
  const [needsChange, setNeedsChange] = useState(false)
  const [changeFor, setChangeFor] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(
    null
  )
  const [couponPreview, setCouponPreview] = useState<{
    discountAmount: string
    deliveryDiscountAmount: string
    deliveryFee: string
    total: string
  } | null>(null)
  const [couponMessage, setCouponMessage] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(
    null
  )
  const [deviceId, setDeviceId] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [challengeSiteKey, setChallengeSiteKey] = useState<string | null>(null)
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0)
  const [orderConfirmation, setOrderConfirmation] = useState<{
    publicOrderId: string
    requestId: string
    total: string
    trackingToken: string | null
    summary: string
  } | null>(null)
  const [trackingLinkMessage, setTrackingLinkMessage] = useState<string | null>(
    null
  )
  const [isPending, startTransition] = useTransition()
  const [isApplyingCoupon, startCouponTransition] = useTransition()
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false)
  const draftStorageKey = useMemo(
    () => buildDigitalMenuDraftStorageKey(menu.store.subdomain),
    [menu.store.subdomain]
  )

  useEffect(() => {
    const storageKey = 'clica-public-device-id'
    const stored = window.localStorage.getItem(storageKey)
    const value = stored || createIdempotencyKey()
    if (!stored) window.localStorage.setItem(storageKey, value)
    setDeviceId(value)
  }, [])

  useEffect(() => {
    let draft = null

    try {
      draft = parseDigitalMenuDraft(
        window.sessionStorage.getItem(draftStorageKey)
      )
    } catch {
      // Some mobile browsers can block session storage in private mode.
      draft = null
    }

    if (draft) {
      setCart(draft.cart)
      setCustomerName(draft.customerName)
      setCustomerPhone(draft.customerPhone)
      setCustomerDocument(draft.customerDocument)
      setOrderNotes(draft.orderNotes)
      setPostalCode(draft.postalCode)
      setStreet(draft.street)
      setNumber(draft.number)
      setNeighborhood(draft.neighborhood)
      setComplement(draft.complement)
      setReference(draft.reference)
      setTermsAccepted(draft.termsAccepted)
      setOrderType(draft.orderType)
      setScheduledFor(draft.scheduledFor)
      setPaymentMethod(draft.paymentMethod)
      setNeedsChange(draft.needsChange)
      setChangeFor(draft.changeFor)
      setCouponCode(draft.couponCode)
      setAppliedCouponCode(null)
    }

    setHasRestoredDraft(true)
  }, [draftStorageKey])

  useEffect(() => {
    if (!hasRestoredDraft || orderConfirmation) return

    const draft: DigitalMenuDraftState = {
      version: 1,
      cart,
      customerName,
      customerPhone,
      customerDocument,
      orderNotes,
      postalCode,
      street,
      number,
      neighborhood,
      complement,
      reference,
      termsAccepted,
      orderType,
      scheduledFor,
      paymentMethod,
      needsChange,
      changeFor,
      couponCode,
      appliedCouponCode: null,
    }

    if (!shouldPersistDigitalMenuDraft(draft)) {
      try {
        window.sessionStorage.removeItem(draftStorageKey)
      } catch {
        // Ignore unavailable storage; the draft is only a UX helper.
      }
      return
    }

    try {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify(draft))
    } catch {
      // Ignore unavailable storage; checkout remains fully functional.
    }
  }, [
    appliedCouponCode,
    cart,
    changeFor,
    complement,
    couponCode,
    customerDocument,
    customerName,
    customerPhone,
    draftStorageKey,
    hasRestoredDraft,
    needsChange,
    neighborhood,
    number,
    orderConfirmation,
    orderNotes,
    orderType,
    paymentMethod,
    postalCode,
    reference,
    scheduledFor,
    street,
    termsAccepted,
  ])

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (total, item) => total + getItemUnitTotal(item) * item.quantity,
        0
      ),
    [cart]
  )

  const cartItemsCount = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart]
  )

  const deliveryQuote = useMemo(() => {
    if (orderType === 'TAKEOUT') {
      return {
        deliveryFee: 0,
        minimumOrderAmount: Number(menu.settings.minimumOrderAmount),
        estimatedDeliveryMinutes: menu.settings.averagePreparationMinutes,
        isAddressCovered: true,
        coverageMessage: null as string | null,
        zoneName: null as string | null,
      }
    }

    if (menu.deliveryZones.length === 0) {
      return {
        deliveryFee: 0,
        minimumOrderAmount: Number(menu.settings.minimumOrderAmount),
        estimatedDeliveryMinutes: menu.settings.averagePreparationMinutes,
        isAddressCovered: false,
        coverageMessage:
          'Entrega indisponivel no momento. Escolha retirada para continuar.',
        zoneName: null as string | null,
      }
    }

    try {
      const quote = quoteDigitalMenuDelivery({
        zones: menu.deliveryZones,
        neighborhood,
        postalCode,
        customerLatitude,
        customerLongitude,
        subtotal: String(cartTotal),
        settings: menu.settings,
      })
      const zone = menu.deliveryZones.find(
        current => current.id === quote.deliveryZoneId
      )

      return {
        deliveryFee: Number(quote.deliveryFee),
        minimumOrderAmount: Number(quote.minimumOrderAmount),
        estimatedDeliveryMinutes:
          quote.deliveryEstimatedMinutes ??
          menu.settings.averagePreparationMinutes,
        isAddressCovered: true,
        coverageMessage: null as string | null,
        zoneName: zone?.name ?? null,
      }
    } catch (error) {
      return {
        deliveryFee: 0,
        minimumOrderAmount: Number(menu.settings.minimumOrderAmount),
        estimatedDeliveryMinutes: menu.settings.averagePreparationMinutes,
        isAddressCovered: !neighborhood && !postalCode && !customerLatitude,
        coverageMessage:
          error instanceof Error
            ? error.message
            : 'Ainda nao entregamos neste endereco.',
        zoneName: null as string | null,
      }
    }
  }, [
    cartTotal,
    customerLatitude,
    customerLongitude,
    menu.deliveryZones,
    menu.settings,
    neighborhood,
    orderType,
    postalCode,
  ])

  const promotionQuote = useMemo(
    () =>
      quoteDigitalMenuPromotion({
        promotions: menu.promotions.map(promotion => ({
          ...promotion,
          startsAt: null,
          endsAt: null,
          usageLimit: null,
          usedCount: 0,
          perCustomerLimit: null,
          priority: 0,
          isFeatured: false,
          metadata: null,
        })),
        couponCode: appliedCouponCode,
        subtotal: String(cartTotal),
        deliveryFee: String(deliveryQuote.deliveryFee),
        cartItemOfferingIds: cart.map(item => item.itemOfferingId),
        allowDeliveryPromotions: orderType === 'DELIVERY',
      }),
    [
      appliedCouponCode,
      cart,
      cartTotal,
      deliveryQuote.deliveryFee,
      menu.promotions,
      orderType,
    ]
  )
  const couponContextKey = `${cartTotal}|${deliveryQuote.deliveryFee}|${orderType}`
  const lastCouponContextKey = useRef(couponContextKey)
  const appliedDiscount =
    Number(couponPreview?.discountAmount ?? promotionQuote.discountAmount) +
    Number(
      couponPreview?.deliveryDiscountAmount ??
        promotionQuote.deliveryDiscountAmount
    )
  const checkoutTotal = Number(couponPreview?.total ?? promotionQuote.total)
  const selectedAvailability =
    orderType === 'DELIVERY'
      ? menu.availabilities.delivery
      : menu.availabilities.takeout
  const availablePaymentMethods = useMemo(
    () =>
      menu.paymentMethods.filter(method =>
        method.availableFor.includes(orderType)
      ),
    [menu.paymentMethods, orderType]
  )
  const selectedPaymentMethod = availablePaymentMethods.find(
    method => method.method === paymentMethod
  )
  const missingMinimumAmount = Math.max(
    0,
    deliveryQuote.minimumOrderAmount - cartTotal
  )
  const allItems = useMemo(
    () =>
      menu.categories.flatMap(category =>
        category.items.map(item => ({
          ...item,
          categoryName: category.name,
          isRecommended: false,
        }))
      ),
    [menu.categories]
  )
  const recommendedItemIds = useMemo(() => {
    const featuredIds = allItems
      .filter(item => item.isFeatured)
      .map(item => item.itemOfferingId)
    const candidates = [...allItems]
      .filter(item => !featuredIds.includes(item.itemOfferingId))
      .sort((first, second) => {
        const secondScore =
          (second.originalPrice ? 4 : 0) +
          (second.imageUrl ? 2 : 0) +
          (second.optionGroups.length > 0 ? 1 : 0)
        const firstScore =
          (first.originalPrice ? 4 : 0) +
          (first.imageUrl ? 2 : 0) +
          (first.optionGroups.length > 0 ? 1 : 0)

        return secondScore - firstScore
      })

    return new Set([
      ...featuredIds,
      ...candidates
        .slice(0, Math.max(0, 6 - featuredIds.length))
        .map(item => item.itemOfferingId),
    ])
  }, [allItems])
  const displayCategories = useMemo<DisplayMenuCategory[]>(() => {
    const normalizedSearch = normalizeSearchText(searchTerm)

    return menu.categories
      .map(category => {
        const items = category.items
          .map(item => ({
            ...item,
            categoryName: category.name,
            isRecommended: recommendedItemIds.has(item.itemOfferingId),
          }))
          .filter(item => {
            if (activeFilter === 'RECOMMENDED' && !item.isRecommended)
              return false
            if (activeFilter === 'WITH_IMAGE' && !item.imageUrl) return false
            if (activeFilter === 'PROMO' && !item.originalPrice) return false

            if (!normalizedSearch) return true

            return normalizeSearchText(
              `${item.name} ${item.description ?? ''} ${category.name}`
            ).includes(normalizedSearch)
          })

        return { ...category, items }
      })
      .filter(category => category.items.length > 0)
  }, [activeFilter, menu.categories, recommendedItemIds, searchTerm])
  const recommendedItems = useMemo(
    () =>
      allItems
        .filter(item => recommendedItemIds.has(item.itemOfferingId))
        .map(item => ({ ...item, isRecommended: true }))
        .slice(0, 6),
    [allItems, recommendedItemIds]
  )
  const hasDiscoveryFilter =
    normalizeSearchText(searchTerm).length > 0 || activeFilter !== 'ALL'
  const whatsappDigits = menu.settings.whatsappPhone?.replace(/\D/g, '') ?? ''
  const whatsappContactUrl =
    whatsappDigits.length >= 10 ? `https://wa.me/${whatsappDigits}` : null
  const pickupAddressLabel = formatPickupAddress(menu.settings.pickupAddress)

  useEffect(() => {
    if (
      availablePaymentMethods.some(method => method.method === paymentMethod)
    ) {
      return
    }

    setPaymentMethod(availablePaymentMethods[0]?.method ?? 'PIX')
    setNeedsChange(false)
    setChangeFor('')
  }, [availablePaymentMethods, paymentMethod])

  useEffect(() => {
    if (cart.length > 0) return

    setCheckoutStep(false)
  }, [cart.length])

  const openItem = (item: DigitalMenuItem) => {
    if (isItemUnavailable(item)) {
      setSubmissionMessage('Este produto esta indisponivel no momento.')
      return
    }

    setSelectedItem(item)
    setEditingCartId(null)
    setSelectedOptions({})
    setItemComment('')
  }

  const closeSelectedItem = () => {
    setSelectedItem(null)
    setEditingCartId(null)
    setSelectedOptions({})
    setItemComment('')
  }

  const toggleOption = (
    optionGroup: DigitalMenuOptionGroup,
    optionId: number,
    checked: boolean
  ) => {
    setSelectedOptions(current => {
      const next = { ...current }
      const selectedInGroup = optionGroup.options.filter(
        option => next[option.id]
      )

      if (!checked) {
        delete next[optionId]
        return next
      }

      if (optionGroup.maxQuantity === 1) {
        for (const option of optionGroup.options) delete next[option.id]
      } else if (selectedInGroup.length >= optionGroup.maxQuantity) {
        delete next[selectedInGroup[0].id]
      }

      next[optionId] = 1
      return next
    })
  }

  const buildSelectedCartOptions = (item: DigitalMenuItem) =>
    item.optionGroups.flatMap(group =>
      group.options
        .filter(option => selectedOptions[option.id])
        .map(option => ({
          optionId: option.id,
          optionName: option.name,
          optionGroupName: group.name,
          price: option.price,
          quantity: selectedOptions[option.id],
        }))
    )

  const addSelectedItemToCart = () => {
    if (!selectedItem) return

    for (const group of selectedItem.optionGroups) {
      const selectedQuantity = group.options.reduce(
        (total, option) => total + (selectedOptions[option.id] ?? 0),
        0
      )
      if (selectedQuantity < group.minQuantity) {
        setSubmissionMessage(
          `Escolha pelo menos ${group.minQuantity} opcao em ${group.name}.`
        )
        return
      }
    }

    const options = buildSelectedCartOptions(selectedItem)
    const comment = menu.settings.allowItemObservations ? itemComment : ''

    if (editingCartId) {
      setCart(current =>
        current.map(item =>
          item.cartId === editingCartId
            ? {
                ...item,
                name: selectedItem.name,
                price: selectedItem.price,
                comment,
                options,
              }
            : item
        )
      )
      setSubmissionMessage(null)
      closeSelectedItem()
      setIsCartOpen(true)
      return
    }

    setCart(current => [
      ...current,
      {
        cartId: createIdempotencyKey(),
        itemOfferingId: selectedItem.itemOfferingId,
        name: selectedItem.name,
        price: selectedItem.price,
        quantity: 1,
        comment,
        options,
      },
    ])
    setSubmissionMessage(null)
    closeSelectedItem()
    setIsCartOpen(true)
  }

  const editCartItem = (cartItem: CartItem) => {
    const catalogItem = allItems.find(
      item => item.itemOfferingId === cartItem.itemOfferingId
    )

    if (!catalogItem) {
      setSubmissionMessage('Este produto nao esta mais disponivel para edicao.')
      return
    }

    const options = cartItem.options.reduce<Record<number, number>>(
      (selected, option) => ({
        ...selected,
        [option.optionId]: option.quantity,
      }),
      {}
    )

    setSelectedItem(catalogItem)
    setSelectedOptions(options)
    setItemComment(cartItem.comment)
    setEditingCartId(cartItem.cartId)
    setIsCartOpen(false)
  }

  const updateCartQuantity = (cartId: string, quantity: number) => {
    setCart(current =>
      current
        .map(item =>
          item.cartId === cartId
            ? { ...item, quantity: Math.max(0, quantity) }
            : item
        )
        .filter(item => item.quantity > 0)
    )
  }

  const startCheckout = () => {
    setIsCartOpen(true)
    setCheckoutStep(true)
  }

  const submitOrder = () => {
    const scheduledDate = parseScheduledDate(scheduledFor)

    if (scheduledFor && !scheduledDate) {
      setSubmissionMessage('Escolha um horario valido para agendar o pedido.')
      return
    }

    const payload: DigitalMenuSubmitInput = {
      storeSlug: menu.store.subdomain,
      idempotencyKey,
      deviceId: deviceId || undefined,
      captchaToken: captchaToken || undefined,
      customerName,
      customerPhone,
      customerDocument: customerDocument || undefined,
      orderNotes: orderNotes || undefined,
      termsAccepted,
      orderType,
      address:
        orderType === 'DELIVERY'
          ? {
              postalCode,
              street,
              number,
              neighborhood,
              complement: complement || undefined,
              reference,
              latitude: customerLatitude,
              longitude: customerLongitude,
            }
          : undefined,
      payment: {
        method: paymentMethod,
        needsChange: paymentMethod === 'CASH' && needsChange,
        changeFor:
          paymentMethod === 'CASH' && needsChange ? changeFor : undefined,
      },
      couponCode: appliedCouponCode ?? undefined,
      scheduledFor: scheduledDate ? scheduledDate.toISOString() : undefined,
      items: cart.map(item => ({
        itemOfferingId: item.itemOfferingId,
        quantity: item.quantity,
        comment: item.comment,
        options: item.options.map(option => ({
          optionId: option.optionId,
          quantity: option.quantity,
        })),
      })),
    }

    startTransition(async () => {
      setSubmissionMessage(null)
      let result: Awaited<ReturnType<typeof submitDigitalMenuOrder>>

      try {
        result = await submitDigitalMenuOrder(payload)
      } catch (error) {
        console.error('Failed to submit digital menu order', error)
        setSubmissionMessage(
          'Nao conseguimos enviar seu pedido agora. Confira os dados e tente novamente.'
        )
        return
      }

      if (!result.ok) {
        setSubmissionMessage(result.message)
        if (result.code === 'CAPTCHA_REQUIRED') {
          setChallengeSiteKey(result.challengeSiteKey ?? null)
          setCaptchaToken(null)
        }
        if (result.code === 'CAPTCHA_FAILED') {
          setChallengeSiteKey(result.challengeSiteKey ?? challengeSiteKey)
          setCaptchaToken(null)
          setCaptchaResetKey(current => current + 1)
        }
        if (
          result.code === 'RATE_LIMITED' ||
          result.code === 'TEMPORARILY_BLOCKED'
        ) {
          setRetryAfterSeconds(result.retryAfterSeconds ?? 60)
        }
        return
      }

      setOrderConfirmation({
        publicOrderId: result.publicOrderId,
        requestId: result.requestId,
        total: result.total,
        trackingToken:
          (result as typeof result & { trackingToken?: string })
            .trackingToken ?? null,
        summary: cart.map(item => `${item.quantity}x ${item.name}`).join(', '),
      })
      setCart([])
      try {
        window.sessionStorage.removeItem(draftStorageKey)
      } catch {
        // Ignore unavailable storage after successful order submission.
      }
      setCaptchaToken(null)
      setChallengeSiteKey(null)
      setRetryAfterSeconds(0)
      setIdempotencyKey(createIdempotencyKey())
      setCheckoutStep(false)
    })
  }

  useEffect(() => {
    if (lastCouponContextKey.current === couponContextKey) return
    lastCouponContextKey.current = couponContextKey
    if (!appliedCouponCode) return
    setAppliedCouponCode(null)
    setCouponPreview(null)
    setCouponMessage('Cupom removido porque o carrinho ou entrega mudou.')
  }, [appliedCouponCode, couponContextKey])

  const applyCoupon = () => {
    const normalized = normalizeCouponCode(couponCode)
    if (!normalized) {
      setAppliedCouponCode(null)
      setCouponPreview(null)
      setCouponMessage('Informe um cupom para aplicar.')
      return
    }
    startCouponTransition(async () => {
      const quote = await quoteDigitalMenuCoupon({
        storeSlug: menu.store.subdomain,
        couponCode: normalized,
        orderType,
        address:
          orderType === 'DELIVERY'
            ? {
                postalCode,
                neighborhood,
                latitude: customerLatitude,
                longitude: customerLongitude,
              }
            : undefined,
        items: cart.map(item => ({
          itemOfferingId: item.itemOfferingId,
          quantity: item.quantity,
          comment: item.comment,
          options: item.options.map(option => ({
            optionId: option.optionId,
            quantity: option.quantity,
          })),
        })),
      })
      if (!quote.ok) {
        setAppliedCouponCode(null)
        setCouponPreview(null)
        setCouponMessage(quote.message)
        return
      }
      setAppliedCouponCode(quote.couponCode)
      setCouponPreview({
        discountAmount: quote.discountAmount,
        deliveryDiscountAmount: quote.deliveryDiscountAmount,
        deliveryFee: quote.deliveryFee,
        total: quote.total,
      })
      setCouponCode(quote.couponCode)
      setCouponMessage(quote.message)
    })
  }

  const removeCoupon = () => {
    setAppliedCouponCode(null)
    setCouponPreview(null)
    setCouponCode('')
    setCouponMessage('Cupom removido.')
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card/80 backdrop-blur">
        {menu.settings.bannerImageUrl && (
          <div className="relative h-36 w-full overflow-hidden bg-muted sm:h-48">
            <Image
              src={menu.settings.bannerImageUrl}
              alt={`Banner de ${menu.store.name}`}
              fill
              priority
              quality={72}
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
          </div>
        )}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-primary/10 text-primary shadow-sm">
              {menu.settings.logoImageUrl ? (
                <Image
                  src={menu.settings.logoImageUrl}
                  alt={`Logo de ${menu.store.name}`}
                  fill
                  quality={80}
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <Store className="size-5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                Cardapio digital
              </p>
              <h1 className="truncate text-xl font-semibold">
                {menu.store.name}
              </h1>
            </div>
          </div>
          <Badge className="shrink-0 border-primary/20 bg-primary/10 text-primary">
            <Clock3 className="size-3" />{' '}
            {menu.settings.averagePreparationMinutes} min
          </Badge>
          {whatsappContactUrl && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <a href={whatsappContactUrl} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </Button>
          )}
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-4">
          <Badge
            className={cn(
              'border',
              menu.availability.isOpen
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            )}
          >
            {menu.availability.statusLabel}
          </Badge>
          {menu.availability.reason && (
            <p className="text-sm text-muted-foreground">
              {menu.availability.reason}
            </p>
          )}
          {!menu.availability.isOpen && menu.availability.canSchedule && (
            <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
              Agendamento disponivel
            </Badge>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-5 lg:h-fit">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            {menu.categories.map(category => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategoryId(category.id)
                  document
                    .getElementById(`category-${category.id}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={cn(
                  'min-w-fit rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  selectedCategoryId === category.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent'
                )}
              >
                {category.name}
              </button>
            ))}
          </nav>
        </aside>

        <section className="space-y-8 pb-24">
          <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:rounded-xl lg:border lg:bg-card/70 lg:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Buscar produto, categoria ou descricao"
                className="h-11 pl-9"
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {[
                ['ALL', 'Todos'],
                ['RECOMMENDED', 'Recomendados'],
                ['WITH_IMAGE', 'Com foto'],
                ['PROMO', 'Promocoes'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveFilter(value as MenuFilter)}
                  className={cn(
                    'flex min-w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors',
                    activeFilter === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  {value === 'RECOMMENDED' ? (
                    <Sparkles className="size-3.5" />
                  ) : value === 'ALL' ? (
                    <SlidersHorizontal className="size-3.5" />
                  ) : null}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!hasDiscoveryFilter && recommendedItems.length > 0 && (
            <section className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Destaques da loja
                </p>
                <h2 className="text-xl font-semibold">
                  Recomendados para pedir agora
                </h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {recommendedItems.map(item => (
                  <button
                    key={item.itemOfferingId}
                    type="button"
                    onClick={() => openItem(item)}
                    className="group w-56 shrink-0 overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          fill
                          quality={70}
                          sizes="(max-width: 640px) 70vw, 224px"
                          className="object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <ShoppingBag className="size-8" />
                        </div>
                      )}
                      <Badge className="absolute left-3 top-3 border-amber-500/30 bg-amber-500/90 text-white">
                        <Sparkles className="size-3" /> Recomendado
                      </Badge>
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="line-clamp-1 text-sm font-semibold">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.categoryName}
                      </p>
                      <p className="font-semibold text-primary">
                        {currency(item.price)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {displayCategories.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <Search className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h2 className="font-semibold">Nenhum produto encontrado</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Tente buscar por outro nome ou remover os filtros.
              </p>
            </div>
          ) : (
            displayCategories.map(category => (
              <CategorySection
                key={category.id}
                category={category}
                onOpenItem={openItem}
                recommendedItemIds={recommendedItemIds}
              />
            ))
          )}
        </section>
      </div>

      {cartItemsCount > 0 && (
        <div className="fixed inset-x-0 bottom-3 z-40 px-3 pb-[env(safe-area-inset-bottom)] sm:bottom-4 sm:px-4">
          <div className="mx-auto grid w-full max-w-2xl grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur">
            <Button
              size="lg"
              variant="outline"
              className="min-w-0 justify-between bg-card/70"
              onClick={() => setIsCartOpen(true)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <ShoppingBag className="size-5 shrink-0" />
                <span className="truncate">Carrinho</span>
              </span>
              <span className="shrink-0">
                {cartItemsCount} - {currency(cartTotal)}
              </span>
            </Button>
            <Button size="lg" className="px-5" onClick={startCheckout}>
              <ReceiptText className="size-4" />
              Finalizar
            </Button>
          </div>
        </div>
      )}

      <Sheet
        open={!!selectedItem}
        onOpenChange={open => !open && closeSelectedItem()}
      >
        <SheetContent className="h-dvh w-full overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:max-w-xl">
          {selectedItem && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedItem.name}</SheetTitle>
                <SheetDescription>{selectedItem.description}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4">
                {selectedItem.imageUrl && (
                  <Image
                    src={selectedItem.imageUrl}
                    alt={selectedItem.name}
                    width={640}
                    height={360}
                    quality={72}
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="aspect-video rounded-lg object-cover"
                  />
                )}
                <p className="text-lg font-semibold text-primary">
                  {currency(selectedItem.price)}
                </p>
                {selectedItem.optionGroups.map(group => (
                  <div key={group.id} className="rounded-lg border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-medium">{group.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          Escolha de {group.minQuantity} a {group.maxQuantity}
                        </p>
                      </div>
                      {group.minQuantity > 0 && <Badge>Obrigatorio</Badge>}
                    </div>
                    <div className="space-y-2">
                      {group.options.map(option => (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
                        >
                          <span>
                            {option.name}
                            {Number(option.price) > 0 && (
                              <span className="ml-2 text-muted-foreground">
                                + {currency(option.price)}
                              </span>
                            )}
                          </span>
                          <input
                            type="checkbox"
                            checked={!!selectedOptions[option.id]}
                            onChange={event =>
                              toggleOption(
                                group,
                                option.id,
                                event.target.checked
                              )
                            }
                            className="size-4 accent-primary"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {menu.settings.allowItemObservations && (
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Observacao do item
                    </label>
                    <Textarea
                      value={itemComment}
                      onChange={event => setItemComment(event.target.value)}
                      placeholder="Ex: sem cebola, molho separado"
                      className="min-h-20"
                    />
                  </div>
                )}
                {submissionMessage && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {submissionMessage}
                  </p>
                )}
              </div>
              <SheetFooter>
                <Button
                  size="lg"
                  onClick={addSelectedItemToCart}
                  disabled={previewMode}
                >
                  {editingCartId ? (
                    <Pencil className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {previewMode
                    ? 'Pedidos desativados na previa'
                    : editingCartId
                      ? 'Salvar alteracoes'
                      : 'Adicionar ao carrinho'}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent className="h-dvh w-full overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Seu pedido</SheetTitle>
            <SheetDescription>
              Revise os itens antes de enviar para a loja.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4">
            {orderConfirmation ? (
              <div className="rounded-lg border bg-card p-5 text-center">
                <CheckCircle2 className="mx-auto mb-3 size-10 text-primary" />
                <h2 className="font-semibold">Pedido recebido</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Seu pedido chegou ao sistema da loja e esta aguardando
                  atendimento pela equipe.
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Protocolo: {orderConfirmation.requestId}
                </p>
                <p className="mt-1 font-semibold">
                  Total: {currency(orderConfirmation.total)}
                </p>
                {orderConfirmation.trackingToken && (
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <Button asChild>
                      <Link href={`/pedido/${orderConfirmation.trackingToken}`}>
                        <Clock3 className="size-4" />
                        Acompanhar pedido
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        const url = `${window.location.origin}/pedido/${orderConfirmation.trackingToken}`
                        try {
                          await navigator.clipboard.writeText(url)
                          setTrackingLinkMessage(
                            'Link de acompanhamento copiado.'
                          )
                        } catch {
                          setTrackingLinkMessage(
                            'Nao foi possivel copiar o link automaticamente.'
                          )
                        }
                      }}
                    >
                      <Copy className="size-4" />
                      Copiar link
                    </Button>
                  </div>
                )}
                <p
                  className="mt-2 text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  {trackingLinkMessage}
                </p>
                {whatsappContactUrl && (
                  <Button asChild className="mt-4" variant="outline">
                    <a
                      href={
                        orderConfirmation.trackingToken
                          ? `${whatsappContactUrl}?text=${encodeURIComponent(
                              `Ola, acabei de fazer o pedido ${orderConfirmation.requestId} no cardapio digital da ${menu.store.name}. Total: ${currency(orderConfirmation.total)}. Link de acompanhamento: ${
                                typeof window === 'undefined'
                                  ? `/pedido/${orderConfirmation.trackingToken}`
                                  : `${window.location.origin}/pedido/${orderConfirmation.trackingToken}`
                              }. Resumo: ${orderConfirmation.summary || 'itens do carrinho'}`
                            )}`
                          : whatsappContactUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Enviar resumo no WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            ) : checkoutStep ? (
              <CheckoutForm
                customerName={customerName}
                customerPhone={customerPhone}
                customerDocument={customerDocument}
                orderNotes={orderNotes}
                postalCode={postalCode}
                street={street}
                number={number}
                neighborhood={neighborhood}
                complement={complement}
                reference={reference}
                termsAccepted={termsAccepted}
                locationMessage={locationMessage}
                showLocationButton={menu.deliveryZones.some(
                  zone => zone.type === 'RADIUS'
                )}
                paymentMethod={paymentMethod}
                changeFor={changeFor}
                orderType={orderType}
                availability={selectedAvailability}
                allowScheduledOrders={menu.settings.allowScheduledOrders}
                scheduleMinLeadMinutes={menu.settings.scheduleMinLeadMinutes}
                scheduleMaxDaysAhead={menu.settings.scheduleMaxDaysAhead}
                scheduledFor={scheduledFor}
                deliveryQuote={deliveryQuote}
                cartSubtotal={cartTotal}
                appliedDiscount={appliedDiscount}
                couponCode={couponCode}
                appliedCouponCode={appliedCouponCode}
                couponMessage={couponMessage}
                checkoutTotal={checkoutTotal}
                missingMinimumAmount={missingMinimumAmount}
                availablePaymentMethods={availablePaymentMethods}
                selectedPaymentMethod={selectedPaymentMethod}
                pickupAddressLabel={pickupAddressLabel}
                cart={cart}
                needsChange={needsChange}
                submissionMessage={submissionMessage}
                challengeSiteKey={challengeSiteKey}
                captchaToken={captchaToken}
                captchaResetKey={captchaResetKey}
                retryAfterSeconds={retryAfterSeconds}
                isPending={isPending}
                isApplyingCoupon={isApplyingCoupon}
                deliveryAvailable={menu.deliveryZones.length > 0}
                onBack={() => setCheckoutStep(false)}
                onSubmit={submitOrder}
                onApplyCoupon={applyCoupon}
                onRemoveCoupon={removeCoupon}
                setCaptchaToken={setCaptchaToken}
                setSubmissionMessage={setSubmissionMessage}
                setCustomerName={setCustomerName}
                setCustomerPhone={setCustomerPhone}
                setCustomerDocument={setCustomerDocument}
                setOrderNotes={setOrderNotes}
                setPostalCode={setPostalCode}
                setStreet={setStreet}
                setNumber={setNumber}
                setNeighborhood={setNeighborhood}
                setComplement={setComplement}
                setReference={setReference}
                setTermsAccepted={setTermsAccepted}
                setCustomerLatitude={setCustomerLatitude}
                setCustomerLongitude={setCustomerLongitude}
                setLocationMessage={setLocationMessage}
                setPaymentMethod={setPaymentMethod}
                setNeedsChange={setNeedsChange}
                setChangeFor={setChangeFor}
                setOrderType={setOrderType}
                setScheduledFor={setScheduledFor}
                setCouponCode={setCouponCode}
              />
            ) : (
              <>
                {cart.length === 0 ? (
                  <div className="rounded-lg border bg-card p-8 text-center">
                    <ShoppingBag className="mx-auto mb-3 size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Seu carrinho esta vazio.
                    </p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div
                      key={item.cartId}
                      className="rounded-lg border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium">{item.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {currency(getItemUnitTotal(item))} un.
                          </p>
                          {item.options.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {item.options.map(option => (
                                <li key={option.optionId}>
                                  {option.optionGroupName}: {option.optionName}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => updateCartQuantity(item.cartId, 0)}
                          aria-label={`Remover ${item.name}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => editCartItem(item)}
                      >
                        <Pencil className="size-4" />
                        Editar adicionais
                      </Button>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() =>
                              updateCartQuantity(item.cartId, item.quantity - 1)
                            }
                          >
                            <Minus className="size-4" />
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() =>
                              updateCartQuantity(item.cartId, item.quantity + 1)
                            }
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                        <strong>
                          {currency(getItemUnitTotal(item) * item.quantity)}
                        </strong>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          {!orderConfirmation && cart.length > 0 && !checkoutStep && (
            <SheetFooter>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <strong>{currency(cartTotal)}</strong>
              </div>
              {orderType === 'DELIVERY' && (
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Entrega</span>
                  <strong>{currency(deliveryQuote.deliveryFee)}</strong>
                </div>
              )}
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Desconto/cupom</span>
                <strong>
                  {appliedDiscount > 0
                    ? `-${currency(appliedDiscount)}`
                    : currency(0)}
                </strong>
              </div>
              <div className="mb-3 flex items-center justify-between border-t pt-3 text-base">
                <span className="font-medium">Total final</span>
                <strong>{currency(checkoutTotal)}</strong>
              </div>
              {missingMinimumAmount > 0 && (
                <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                  Faltam {currency(missingMinimumAmount)} para atingir o pedido
                  minimo.
                </p>
              )}
              <Button
                size="lg"
                onClick={() => setCheckoutStep(true)}
                disabled={missingMinimumAmount > 0}
              >
                <ReceiptText className="size-4" />
                Continuar para checkout
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </main>
  )
}

const CategorySection = ({
  category,
  onOpenItem,
  recommendedItemIds,
}: {
  category: DisplayMenuCategory
  onOpenItem: (item: DigitalMenuItem) => void
  recommendedItemIds: Set<number>
}) => {
  return (
    <section id={`category-${category.id}`} className="scroll-mt-6">
      <div className="mb-3">
        <h2 className="text-xl font-semibold">{category.name}</h2>
        {category.description && (
          <p className="text-sm text-muted-foreground">
            {category.description}
          </p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {category.items.map(item => (
          <button
            key={item.itemOfferingId}
            type="button"
            onClick={() => onOpenItem(item)}
            disabled={isItemUnavailable(item)}
            className={cn(
              'group grid min-h-32 grid-cols-[minmax(0,1fr)_112px] overflow-hidden rounded-lg border bg-card text-left transition-all hover:border-primary/50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 sm:grid-cols-[minmax(0,1fr)_128px]',
              recommendedItemIds.has(item.itemOfferingId) && 'border-primary/30'
            )}
          >
            <div className="flex flex-1 flex-col p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{item.name}</h3>
                {recommendedItemIds.has(item.itemOfferingId) && (
                  <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    Recomendado
                  </Badge>
                )}
                {item.originalPrice && (
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    Promo
                  </Badge>
                )}
                {item.promotionBadges.slice(0, 2).map(badge => (
                  <Badge
                    key={badge}
                    className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                  >
                    {badge}
                  </Badge>
                ))}
              </div>
              {item.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                {item.originalPrice && (
                  <span className="text-sm text-muted-foreground line-through">
                    {currency(item.originalPrice)}
                  </span>
                )}
                <span className="font-semibold text-primary">
                  {currency(item.price)}
                </span>
                {item.optionGroups.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Adicionais e variacoes
                  </span>
                )}
                {isItemUnavailable(item) && (
                  <span className="text-xs font-medium text-destructive">
                    Indisponivel
                  </span>
                )}
              </div>
            </div>
            <div className="relative min-h-32 bg-muted">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  quality={70}
                  sizes="(max-width: 640px) 112px, 128px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ShoppingBag className="size-8" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

const CheckoutForm = ({
  customerName,
  customerPhone,
  customerDocument,
  orderNotes,
  postalCode,
  street,
  number,
  neighborhood,
  complement,
  reference,
  termsAccepted,
  locationMessage,
  showLocationButton,
  paymentMethod,
  changeFor,
  orderType,
  availability,
  allowScheduledOrders,
  scheduleMinLeadMinutes,
  scheduleMaxDaysAhead,
  scheduledFor,
  deliveryQuote,
  cartSubtotal,
  appliedDiscount,
  couponCode,
  appliedCouponCode,
  couponMessage,
  checkoutTotal,
  missingMinimumAmount,
  availablePaymentMethods,
  selectedPaymentMethod,
  pickupAddressLabel,
  cart,
  needsChange,
  submissionMessage,
  challengeSiteKey,
  captchaToken,
  captchaResetKey,
  retryAfterSeconds,
  isPending,
  isApplyingCoupon,
  deliveryAvailable,
  onBack,
  onSubmit,
  onApplyCoupon,
  onRemoveCoupon,
  setCaptchaToken,
  setSubmissionMessage,
  setCustomerName,
  setCustomerPhone,
  setCustomerDocument,
  setOrderNotes,
  setPostalCode,
  setStreet,
  setNumber,
  setNeighborhood,
  setComplement,
  setReference,
  setTermsAccepted,
  setCustomerLatitude,
  setCustomerLongitude,
  setLocationMessage,
  setPaymentMethod,
  setNeedsChange,
  setChangeFor,
  setOrderType,
  setScheduledFor,
  setCouponCode,
}: {
  customerName: string
  customerPhone: string
  customerDocument: string
  orderNotes: string
  postalCode: string
  street: string
  number: string
  neighborhood: string
  complement: string
  reference: string
  termsAccepted: boolean
  locationMessage: string | null
  showLocationButton: boolean
  paymentMethod: DigitalMenuSubmitInput['payment']['method']
  changeFor: string
  orderType: DigitalMenuSubmitInput['orderType']
  availability: DigitalMenuAvailability
  allowScheduledOrders: boolean
  scheduleMinLeadMinutes: number
  scheduleMaxDaysAhead: number
  scheduledFor: string
  deliveryQuote: {
    deliveryFee: number
    minimumOrderAmount: number
    estimatedDeliveryMinutes: number
    isAddressCovered: boolean
    coverageMessage: string | null
    zoneName: string | null
  }
  cartSubtotal: number
  appliedDiscount: number
  couponCode: string
  appliedCouponCode: string | null
  couponMessage: string | null
  checkoutTotal: number
  missingMinimumAmount: number
  availablePaymentMethods: {
    method: DigitalMenuSubmitInput['payment']['method']
    label: string
    instructions: string | null
    proofInstructions: string | null
    pixKey: string | null
    integrationProvider: string | null
    requiresChangeFor: boolean
    availableFor: DigitalMenuSubmitInput['orderType'][]
  }[]
  selectedPaymentMethod:
    | {
        method: DigitalMenuSubmitInput['payment']['method']
        label: string
        instructions: string | null
        proofInstructions: string | null
        pixKey: string | null
        integrationProvider: string | null
        requiresChangeFor: boolean
        availableFor: DigitalMenuSubmitInput['orderType'][]
      }
    | undefined
  pickupAddressLabel: string | null
  cart: CartItem[]
  needsChange: boolean
  submissionMessage: string | null
  challengeSiteKey: string | null
  captchaToken: string | null
  captchaResetKey: number
  retryAfterSeconds: number
  isPending: boolean
  isApplyingCoupon: boolean
  deliveryAvailable: boolean
  onBack: () => void
  onSubmit: () => void
  onApplyCoupon: () => void
  onRemoveCoupon: () => void
  setCaptchaToken: (value: string | null) => void
  setSubmissionMessage: (value: string | null) => void
  setCustomerName: (value: string) => void
  setCustomerPhone: (value: string) => void
  setCustomerDocument: (value: string) => void
  setOrderNotes: (value: string) => void
  setPostalCode: (value: string) => void
  setStreet: (value: string) => void
  setNumber: (value: string) => void
  setNeighborhood: (value: string) => void
  setComplement: (value: string) => void
  setReference: (value: string) => void
  setTermsAccepted: (value: boolean) => void
  setCustomerLatitude: (value: number | undefined) => void
  setCustomerLongitude: (value: number | undefined) => void
  setLocationMessage: (value: string | null) => void
  setPaymentMethod: (value: DigitalMenuSubmitInput['payment']['method']) => void
  setNeedsChange: (value: boolean) => void
  setChangeFor: (value: string) => void
  setOrderType: (value: DigitalMenuSubmitInput['orderType']) => void
  setScheduledFor: (value: string) => void
  setCouponCode: (value: string) => void
}) => {
  const [validationAttempted, setValidationAttempted] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(retryAfterSeconds)

  useEffect(() => setRemainingSeconds(retryAfterSeconds), [retryAfterSeconds])
  useEffect(() => {
    if (remainingSeconds <= 0) return
    const timer = window.setTimeout(
      () => setRemainingSeconds(current => Math.max(0, current - 1)),
      1000
    )
    return () => window.clearTimeout(timer)
  }, [remainingSeconds])
  const now = new Date()
  const minScheduledDate = new Date(
    now.getTime() + scheduleMinLeadMinutes * 60 * 1000
  )
  const maxScheduledDate = new Date(
    now.getTime() + scheduleMaxDaysAhead * 24 * 60 * 60 * 1000
  )
  const scheduledDate = parseScheduledDate(scheduledFor)
  const canCheckoutNow = availability.isOpen
  const canCheckoutScheduled =
    allowScheduledOrders &&
    availability.canSchedule &&
    !!scheduledFor &&
    !!scheduledDate
  const phoneDigits = customerPhone.replace(/\D/g, '')
  const postalCodeDigits = postalCode.replace(/\D/g, '')
  const documentDigits = customerDocument.replace(/\D/g, '')
  const fieldErrors = {
    customerName:
      customerName.trim().length < 2 ? 'Informe seu nome completo.' : null,
    customerPhone:
      phoneDigits.length < 10 || phoneDigits.length > 11
        ? 'Informe um WhatsApp com DDD.'
        : null,
    customerDocument:
      documentDigits.length > 0 && !isValidCpf(documentDigits)
        ? 'Informe um CPF valido.'
        : null,
    postalCode:
      orderType === 'DELIVERY' && postalCodeDigits.length !== 8
        ? 'Informe um CEP com 8 numeros.'
        : null,
    street:
      orderType === 'DELIVERY' && !street.trim() ? 'Informe a rua.' : null,
    number:
      orderType === 'DELIVERY' && !number.trim() ? 'Informe o numero.' : null,
    neighborhood:
      orderType === 'DELIVERY' && !neighborhood.trim()
        ? 'Informe o bairro para calcular a zona de entrega.'
        : null,
    termsAccepted: !termsAccepted
      ? 'Aceite os termos para enviar o pedido.'
      : null,
    changeFor:
      paymentMethod === 'CASH' && needsChange && !changeFor.trim()
        ? 'Informe o valor para o troco.'
        : null,
    scheduledFor:
      scheduledFor && !scheduledDate
        ? 'Escolha um horario valido para agendar o pedido.'
        : scheduledDate &&
            (scheduledDate < minScheduledDate ||
              scheduledDate > maxScheduledDate)
          ? `Escolha um horario entre ${scheduleMinLeadMinutes} minutos e ${scheduleMaxDaysAhead} dias a partir de agora.`
          : null,
  }
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean)
  const canAttemptOrder =
    (canCheckoutNow || canCheckoutScheduled) &&
    (orderType === 'TAKEOUT' || deliveryAvailable) &&
    deliveryQuote.isAddressCovered &&
    missingMinimumAmount === 0 &&
    !!selectedPaymentMethod
  const canSubmitOrder =
    canAttemptOrder &&
    !hasFieldErrors &&
    remainingSeconds === 0 &&
    (!challengeSiteKey || !!captchaToken)

  const submitValidatedOrder = () => {
    setValidationAttempted(true)
    if (!canSubmitOrder) return
    onSubmit()
  }

  useEffect(() => {
    if (!deliveryAvailable && orderType === 'DELIVERY') {
      setOrderType('TAKEOUT')
    }
  }, [deliveryAvailable, orderType, setOrderType])

  const requestCustomerLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Seu navegador nao permite compartilhar localizacao.')
      return
    }

    setLocationMessage('Buscando sua localizacao...')
    navigator.geolocation.getCurrentPosition(
      position => {
        setCustomerLatitude(position.coords.latitude)
        setCustomerLongitude(position.coords.longitude)
        setLocationMessage('Localizacao recebida para calcular a entrega.')
      },
      () => {
        setCustomerLatitude(undefined)
        setCustomerLongitude(undefined)
        setLocationMessage('Nao foi possivel acessar sua localizacao.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const copyPixKey = async () => {
    if (!selectedPaymentMethod?.pixKey) return

    try {
      await navigator.clipboard.writeText(selectedPaymentMethod.pixKey)
    } catch {
      setLocationMessage('Nao foi possivel copiar a chave Pix automaticamente.')
    }
  }

  const clearLocationQuote = () => {
    setCustomerLatitude(undefined)
    setCustomerLongitude(undefined)
    setLocationMessage(null)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!deliveryAvailable}
          onClick={() => {
            setOrderType('DELIVERY')
            setScheduledFor('')
          }}
          className={cn(
            'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50',
            orderType === 'DELIVERY'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background hover:bg-accent'
          )}
        >
          <Truck className="size-4" />
          Entrega
        </button>
        <button
          type="button"
          onClick={() => {
            setOrderType('TAKEOUT')
            setScheduledFor('')
          }}
          className={cn(
            'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm',
            orderType === 'TAKEOUT'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background hover:bg-accent'
          )}
        >
          <HandPlatter className="size-4" />
          Retirada
        </button>
      </div>

      {!deliveryAvailable && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          Entrega indisponivel no momento: a loja nao possui uma zona de entrega
          configurada. Escolha retirada para continuar.
        </p>
      )}

      <div
        className={cn(
          'rounded-lg border p-4 text-sm',
          availability.isOpen
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <strong>{availability.statusLabel}</strong>
          {availability.canSchedule && (
            <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
              aceita agendamento
            </Badge>
          )}
        </div>
        {availability.reason && <p className="mt-2">{availability.reason}</p>}
        {!availability.isOpen && availability.canSchedule && (
          <label className="mt-3 block space-y-1 font-medium">
            Agendar pedido
            <Input
              type="datetime-local"
              min={toDatetimeLocalInputValue(minScheduledDate)}
              max={toDatetimeLocalInputValue(maxScheduledDate)}
              value={scheduledFor}
              aria-invalid={validationAttempted && !!fieldErrors.scheduledFor}
              onChange={event => setScheduledFor(event.target.value)}
            />
            <span className="block text-xs font-normal opacity-80">
              Escolha um horario entre {scheduleMinLeadMinutes} minutos e{' '}
              {scheduleMaxDaysAhead} dias a partir de agora.
            </span>
            {validationAttempted && fieldErrors.scheduledFor && (
              <span className="block text-xs font-normal text-destructive">
                {fieldErrors.scheduledFor}
              </span>
            )}
          </label>
        )}
        {availability.isOpen && allowScheduledOrders && (
          <label className="mt-3 block space-y-1 font-medium">
            Agendar para depois (opcional)
            <Input
              type="datetime-local"
              min={toDatetimeLocalInputValue(minScheduledDate)}
              max={toDatetimeLocalInputValue(maxScheduledDate)}
              value={scheduledFor}
              aria-invalid={validationAttempted && !!fieldErrors.scheduledFor}
              onChange={event => setScheduledFor(event.target.value)}
            />
            {validationAttempted && fieldErrors.scheduledFor && (
              <span className="block text-xs font-normal text-destructive">
                {fieldErrors.scheduledFor}
              </span>
            )}
          </label>
        )}
      </div>

      <section className="space-y-3 border-t pt-4">
        <h3 className="font-medium">Seus dados</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Nome completo
            <Input
              autoComplete="name"
              value={customerName}
              aria-invalid={validationAttempted && !!fieldErrors.customerName}
              onChange={event => setCustomerName(event.target.value)}
            />
            {validationAttempted && fieldErrors.customerName && (
              <span className="block text-xs font-normal text-destructive">
                {fieldErrors.customerName}
              </span>
            )}
          </label>
          <label className="space-y-1 text-sm font-medium">
            WhatsApp
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              value={customerPhone}
              aria-invalid={validationAttempted && !!fieldErrors.customerPhone}
              onChange={event => setCustomerPhone(event.target.value)}
            />
            {validationAttempted && fieldErrors.customerPhone && (
              <span className="block text-xs font-normal text-destructive">
                {fieldErrors.customerPhone}
              </span>
            )}
          </label>
        </div>
        <label className="block space-y-1 text-sm font-medium">
          CPF{' '}
          <span className="font-normal text-muted-foreground">(opcional)</span>
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={customerDocument}
            aria-invalid={validationAttempted && !!fieldErrors.customerDocument}
            onChange={event => setCustomerDocument(event.target.value)}
          />
          {validationAttempted && fieldErrors.customerDocument && (
            <span className="block text-xs font-normal text-destructive">
              {fieldErrors.customerDocument}
            </span>
          )}
        </label>
      </section>

      {orderType === 'DELIVERY' ? (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 font-medium">Endereco de entrega</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              CEP
              <Input
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                value={postalCode}
                aria-invalid={validationAttempted && !!fieldErrors.postalCode}
                onChange={event => {
                  setPostalCode(event.target.value)
                  clearLocationQuote()
                }}
              />
              {validationAttempted && fieldErrors.postalCode && (
                <span className="block text-xs font-normal text-destructive">
                  {fieldErrors.postalCode}
                </span>
              )}
            </label>
            <label className="space-y-1 text-sm font-medium">
              Bairro
              <Input
                autoComplete="address-level3"
                value={neighborhood}
                aria-invalid={validationAttempted && !!fieldErrors.neighborhood}
                onChange={event => {
                  setNeighborhood(event.target.value)
                  clearLocationQuote()
                }}
              />
              {validationAttempted && fieldErrors.neighborhood && (
                <span className="block text-xs font-normal text-destructive">
                  {fieldErrors.neighborhood}
                </span>
              )}
              <span className="block text-xs font-normal text-muted-foreground">
                Usado para verificar a zona e a taxa de entrega.
              </span>
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_112px]">
            <label className="space-y-1 text-sm font-medium">
              Rua
              <Input
                autoComplete="address-line1"
                value={street}
                aria-invalid={validationAttempted && !!fieldErrors.street}
                onChange={event => {
                  setStreet(event.target.value)
                  clearLocationQuote()
                }}
              />
              {validationAttempted && fieldErrors.street && (
                <span className="block text-xs font-normal text-destructive">
                  {fieldErrors.street}
                </span>
              )}
            </label>
            <label className="space-y-1 text-sm font-medium">
              Numero
              <Input
                inputMode="numeric"
                value={number}
                aria-invalid={validationAttempted && !!fieldErrors.number}
                onChange={event => {
                  setNumber(event.target.value)
                  clearLocationQuote()
                }}
              />
              {validationAttempted && fieldErrors.number && (
                <span className="block text-xs font-normal text-destructive">
                  {fieldErrors.number}
                </span>
              )}
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              Complemento{' '}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
              <Input
                autoComplete="address-line2"
                placeholder="Apto, bloco..."
                value={complement}
                onChange={event => setComplement(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Referencia{' '}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
              <Input
                placeholder="Proximo a..."
                value={reference}
                onChange={event => setReference(event.target.value)}
              />
            </label>
          </div>
          {showLocationButton && (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={requestCustomerLocation}
              >
                Usar minha localização
              </Button>
              {locationMessage && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {locationMessage}
                </p>
              )}
            </div>
          )}
          {!deliveryQuote.isAddressCovered && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deliveryQuote.coverageMessage ??
                'Ainda nao entregamos neste endereco.'}
            </p>
          )}
          {deliveryQuote.zoneName && (
            <p className="mt-3 text-sm text-muted-foreground">
              Regiao: {deliveryQuote.zoneName} · entrega em torno de{' '}
              {deliveryQuote.estimatedDeliveryMinutes} min
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Seu pedido sera retirado no balcao. A loja informara o preparo pelo
          acompanhamento do pedido.
          {pickupAddressLabel && (
            <p className="mt-2 font-medium text-foreground">
              Retirada em: {pickupAddressLabel}
            </p>
          )}
        </div>
      )}

      <label className="block space-y-1 text-sm font-medium">
        Observacao geral{' '}
        <span className="font-normal text-muted-foreground">(opcional)</span>
        <Textarea
          value={orderNotes}
          placeholder="Ex.: chamar no portao, retirar ingrediente..."
          onChange={event => setOrderNotes(event.target.value)}
        />
      </label>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 font-medium">Pagamento</h3>
        {availablePaymentMethods.length === 0 ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            Esta loja ainda nao habilitou pagamentos para este tipo de pedido.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {availablePaymentMethods.map(method => (
              <button
                key={method.method}
                type="button"
                onClick={() => {
                  setPaymentMethod(method.method)
                  setNeedsChange(false)
                  setChangeFor('')
                }}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm',
                  paymentMethod === method.method
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                )}
              >
                {method.label}
              </button>
            ))}
          </div>
        )}

        {selectedPaymentMethod?.instructions && (
          <p className="mt-3 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-200">
            {selectedPaymentMethod.instructions}
          </p>
        )}

        {selectedPaymentMethod?.method === 'PIX' && (
          <div className="mt-3 space-y-3 rounded-md border bg-background p-3">
            {selectedPaymentMethod.pixKey ? (
              <div>
                <span className="text-xs font-medium text-muted-foreground">
                  Chave Pix
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                    {selectedPaymentMethod.pixKey}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label="Copiar chave Pix"
                    title="Copiar chave Pix"
                    onClick={copyPixKey}
                  >
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                A loja ainda nao informou uma chave Pix. Confira as instrucoes
                antes de finalizar.
              </p>
            )}
            {selectedPaymentMethod.proofInstructions && (
              <p className="text-sm text-muted-foreground">
                {selectedPaymentMethod.proofInstructions}
              </p>
            )}
          </div>
        )}

        {paymentMethod === 'CASH' &&
          selectedPaymentMethod?.requiresChangeFor && (
            <div className="mt-3 space-y-3 rounded-md border bg-background p-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium">
                Precisa de troco?
                <input
                  type="checkbox"
                  checked={needsChange}
                  onChange={event => {
                    setNeedsChange(event.target.checked)
                    if (!event.target.checked) setChangeFor('')
                  }}
                  className="size-4 accent-primary"
                />
              </label>
              {needsChange && (
                <label className="block space-y-1 text-sm font-medium">
                  Troco para quanto?
                  <Input
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    value={changeFor}
                    aria-invalid={
                      validationAttempted && !!fieldErrors.changeFor
                    }
                    onChange={event => setChangeFor(event.target.value)}
                  />
                  {validationAttempted && fieldErrors.changeFor && (
                    <span className="block text-xs font-normal text-destructive">
                      {fieldErrors.changeFor}
                    </span>
                  )}
                </label>
              )}
            </div>
          )}
      </div>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1 text-sm font-medium">
            Cupom promocional
            <Input
              value={couponCode}
              onChange={event => setCouponCode(event.target.value)}
              placeholder="Ex: PRIMEIRA10"
              disabled={!!appliedCouponCode}
            />
          </label>
          {appliedCouponCode ? (
            <Button type="button" variant="outline" onClick={onRemoveCoupon}>
              Remover cupom
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              isLoading={isApplyingCoupon}
              disabled={isApplyingCoupon}
              onClick={onApplyCoupon}
            >
              Aplicar cupom
            </Button>
          )}
        </div>
        {couponMessage && (
          <p
            className={cn(
              'mt-2 text-sm',
              appliedCouponCode
                ? 'text-emerald-600 dark:text-emerald-300'
                : 'text-destructive'
            )}
            aria-live="polite"
          >
            {couponMessage}
          </p>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h3 className="mb-3 font-medium">Resumo do pedido</h3>
        <div className="space-y-3 border-b pb-3">
          {cart.map(item => (
            <div
              key={item.cartId}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {item.quantity}x {item.name}
                </p>
                {item.options.map(option => (
                  <p
                    key={option.optionId}
                    className="text-xs text-muted-foreground"
                  >
                    {option.optionGroupName}: {option.optionName}
                    {Number(option.price) > 0
                      ? ` (+${currency(Number(option.price) * option.quantity)})`
                      : ''}
                  </p>
                ))}
              </div>
              <strong className="shrink-0">
                {currency(getItemUnitTotal(item) * item.quantity)}
              </strong>
            </div>
          ))}
        </div>
        <dl className="space-y-2 border-b py-3">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Modalidade</dt>
            <dd className="text-right font-medium">
              {orderType === 'DELIVERY' ? 'Entrega' : 'Retirada'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Destino</dt>
            <dd className="max-w-[70%] text-right font-medium">
              {orderType === 'DELIVERY'
                ? `${street || 'Rua'}, ${number || 's/n'} - ${neighborhood || 'bairro'}`
                : (pickupAddressLabel ?? 'Balcao da loja')}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Pagamento</dt>
            <dd className="text-right font-medium">
              {selectedPaymentMethod?.label ?? 'Nao selecionado'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Prazo</dt>
            <dd className="text-right font-medium">
              {scheduledFor
                ? new Date(scheduledFor).toLocaleString('pt-BR')
                : `cerca de ${deliveryQuote.estimatedDeliveryMinutes} min`}
            </dd>
          </div>
        </dl>
        <div className="space-y-2 pt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <strong>{currency(cartSubtotal)}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxa de entrega</span>
            <strong>{currency(deliveryQuote.deliveryFee)}</strong>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="text-muted-foreground">Desconto/cupom</span>
            <strong>
              {appliedDiscount > 0
                ? `-${currency(appliedDiscount)}`
                : currency(0)}
            </strong>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="text-muted-foreground">Total final</span>
            <strong>{currency(checkoutTotal)}</strong>
          </div>
          {missingMinimumAmount > 0 && (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
              Faltam {currency(missingMinimumAmount)} para atingir o pedido
              minimo.
            </p>
          )}
        </div>
      </section>

      <label className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={event => setTermsAccepted(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          Confirmo que revisei os dados e aceito o envio deste pedido para a
          loja.
          {validationAttempted && fieldErrors.termsAccepted && (
            <span className="mt-1 block text-xs text-destructive">
              {fieldErrors.termsAccepted}
            </span>
          )}
        </span>
      </label>

      {challengeSiteKey && (
        <section
          role="group"
          aria-labelledby="checkout-verification-title"
          className="scroll-mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4"
        >
          <div className="mb-3 flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <h3 id="checkout-verification-title" className="font-medium">
                Confirme que e voce
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Precisamos de uma verificacao rapida antes de enviar seu pedido.
              </p>
            </div>
          </div>
          <ConditionalTurnstile
            siteKey={challengeSiteKey}
            resetKey={captchaResetKey}
            onToken={setCaptchaToken}
            onError={setSubmissionMessage}
          />
        </section>
      )}

      {submissionMessage && (
        <p
          aria-live="polite"
          className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
        >
          {submissionMessage}
          {remainingSeconds > 0 && (
            <span className="mt-1 block font-medium">
              Tentar novamente em{' '}
              {Math.floor(remainingSeconds / 60)
                .toString()
                .padStart(2, '0')}
              :{(remainingSeconds % 60).toString().padStart(2, '0')}
            </span>
          )}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 grid gap-2 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:grid-cols-2 sm:border-0 sm:bg-transparent sm:p-0">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button
          onClick={submitValidatedOrder}
          isLoading={isPending}
          disabled={
            !canAttemptOrder ||
            remainingSeconds > 0 ||
            (!!challengeSiteKey && !captchaToken)
          }
        >
          {remainingSeconds > 0
            ? 'Aguarde para tentar novamente'
            : challengeSiteKey
              ? 'Confirmar e enviar'
              : 'Enviar pedido'}
        </Button>
      </div>
    </div>
  )
}
