'use client'

import { submitDigitalMenuOrder } from '@/features/digital-menu/api'
import {
  DigitalMenuCategory,
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
  Minus,
  Plus,
  ReceiptText,
  ShoppingBag,
  Store,
  Trash2,
} from 'lucide-react'
import Image from 'next/image'
import { useMemo, useState, useTransition } from 'react'

type CartOption = {
  optionId: number
  optionName: string
  optionGroupName: string
  price: string
  quantity: number
}

type CartItem = {
  cartId: string
  itemOfferingId: number
  name: string
  price: string
  quantity: number
  comment: string
  options: CartOption[]
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

export const DigitalMenuClient = ({ menu }: { menu: DigitalMenuData }) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    menu.categories[0]?.id
  )
  const [selectedItem, setSelectedItem] = useState<DigitalMenuItem | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>(
    {}
  )
  const [itemComment, setItemComment] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [reference, setReference] = useState('')
  const [paymentMethod, setPaymentMethod] =
    useState<DigitalMenuSubmitInput['payment']['method']>('PIX')
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [orderConfirmation, setOrderConfirmation] = useState<{
    publicOrderId: string
    requestId: string
    total: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()

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

  const openItem = (item: DigitalMenuItem) => {
    setSelectedItem(item)
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

    const options = selectedItem.optionGroups.flatMap(group =>
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

    setCart(current => [
      ...current,
      {
        cartId: createIdempotencyKey(),
        itemOfferingId: selectedItem.itemOfferingId,
        name: selectedItem.name,
        price: selectedItem.price,
        quantity: 1,
        comment: itemComment,
        options,
      },
    ])
    setSubmissionMessage(null)
    setSelectedItem(null)
    setIsCartOpen(true)
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

  const submitOrder = () => {
    const payload: DigitalMenuSubmitInput = {
      storeSlug: menu.store.subdomain,
      idempotencyKey: createIdempotencyKey(),
      customerName,
      customerPhone,
      orderType: 'DELIVERY',
      address: { street, number, neighborhood, reference },
      payment: { method: paymentMethod },
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
      const result = await submitDigitalMenuOrder(payload)

      if (!result.ok) {
        setSubmissionMessage(result.message)
        return
      }

      setOrderConfirmation({
        publicOrderId: result.publicOrderId,
        requestId: result.requestId,
        total: result.total,
      })
      setCart([])
      setCheckoutStep(false)
    })
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Store className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                Cardapio digital
              </p>
              <h1 className="text-xl font-semibold">{menu.store.name}</h1>
            </div>
          </div>
          <Badge className="border-primary/20 bg-primary/10 text-primary">
            <Clock3 className="size-3" /> Recebendo pedidos
          </Badge>
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
          {menu.categories.map(category => (
            <CategorySection
              key={category.id}
              category={category}
              onOpenItem={openItem}
            />
          ))}
        </section>
      </div>

      {cartItemsCount > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 px-4">
          <Button
            size="xl"
            className="mx-auto flex w-full max-w-2xl justify-between shadow-lg"
            onClick={() => setIsCartOpen(true)}
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="size-5" />
              Ver carrinho
            </span>
            <span>
              {cartItemsCount} itens - {currency(cartTotal)}
            </span>
          </Button>
        </div>
      )}

      <Sheet open={!!selectedItem} onOpenChange={open => !open && setSelectedItem(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
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
                              toggleOption(group, option.id, event.target.checked)
                            }
                            className="size-4 accent-primary"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
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
                {submissionMessage && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {submissionMessage}
                  </p>
                )}
              </div>
              <SheetFooter>
                <Button size="lg" onClick={addSelectedItemToCart}>
                  <Plus className="size-4" />
                  Adicionar ao carrinho
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
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
              </div>
            ) : checkoutStep ? (
              <CheckoutForm
                customerName={customerName}
                customerPhone={customerPhone}
                street={street}
                number={number}
                neighborhood={neighborhood}
                reference={reference}
                paymentMethod={paymentMethod}
                submissionMessage={submissionMessage}
                isPending={isPending}
                onBack={() => setCheckoutStep(false)}
                onSubmit={submitOrder}
                setCustomerName={setCustomerName}
                setCustomerPhone={setCustomerPhone}
                setStreet={setStreet}
                setNumber={setNumber}
                setNeighborhood={setNeighborhood}
                setReference={setReference}
                setPaymentMethod={setPaymentMethod}
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
                    <div key={item.cartId} className="rounded-lg border bg-card p-4">
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
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
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
              <Button size="lg" onClick={() => setCheckoutStep(true)}>
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
}: {
  category: DigitalMenuCategory
  onOpenItem: (item: DigitalMenuItem) => void
}) => {
  return (
    <section id={`category-${category.id}`} className="scroll-mt-6">
      <div className="mb-3">
        <h2 className="text-xl font-semibold">{category.name}</h2>
        {category.description && (
          <p className="text-sm text-muted-foreground">{category.description}</p>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {category.items.map(item => (
          <button
            key={item.itemOfferingId}
            type="button"
            onClick={() => onOpenItem(item)}
            className="group flex min-h-32 overflow-hidden rounded-lg border bg-card text-left transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div className="flex flex-1 flex-col p-4">
              <h3 className="font-semibold">{item.name}</h3>
              {item.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.description}
                </p>
              )}
              <div className="mt-auto pt-4">
                <span className="font-semibold text-primary">
                  {currency(item.price)}
                </span>
              </div>
            </div>
            <div className="relative h-auto w-28 shrink-0 bg-muted md:w-32">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="160px"
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
  street,
  number,
  neighborhood,
  reference,
  paymentMethod,
  submissionMessage,
  isPending,
  onBack,
  onSubmit,
  setCustomerName,
  setCustomerPhone,
  setStreet,
  setNumber,
  setNeighborhood,
  setReference,
  setPaymentMethod,
}: {
  customerName: string
  customerPhone: string
  street: string
  number: string
  neighborhood: string
  reference: string
  paymentMethod: DigitalMenuSubmitInput['payment']['method']
  submissionMessage: string | null
  isPending: boolean
  onBack: () => void
  onSubmit: () => void
  setCustomerName: (value: string) => void
  setCustomerPhone: (value: string) => void
  setStreet: (value: string) => void
  setNumber: (value: string) => void
  setNeighborhood: (value: string) => void
  setReference: (value: string) => void
  setPaymentMethod: (value: DigitalMenuSubmitInput['payment']['method']) => void
}) => {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Nome
          <Input value={customerName} onChange={event => setCustomerName(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Telefone
          <Input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} />
        </label>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 font-medium">Endereco de entrega</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
          <Input placeholder="Rua" value={street} onChange={event => setStreet(event.target.value)} />
          <Input placeholder="Numero" value={number} onChange={event => setNumber(event.target.value)} />
        </div>
        <Input
          className="mt-3"
          placeholder="Bairro"
          value={neighborhood}
          onChange={event => setNeighborhood(event.target.value)}
        />
        <Input
          className="mt-3"
          placeholder="Referencia (opcional)"
          value={reference}
          onChange={event => setReference(event.target.value)}
        />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 font-medium">Pagamento</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['PIX', 'CASH'] as const).map(method => (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method)}
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                paymentMethod === method
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent'
              )}
            >
              {method === 'CASH' ? 'Dinheiro' : 'Pix'}
            </button>
          ))}
        </div>
      </div>

      {submissionMessage && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {submissionMessage}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onSubmit} isLoading={isPending}>
          Enviar pedido
        </Button>
      </div>
    </div>
  )
}
