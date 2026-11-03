'use client'

import { useEffect, useRef, useState } from 'react'
import { LogOut, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import {
  clearWalletSession,
  getWalletBalance,
  requestWalletCode,
  verifyWalletCode,
} from '../wallet-auth-actions'
import { walletInputAmount } from '../wallet-payment-policy'
import type { ProductRewardState } from '../product-rewards-policy'

export type CheckoutProductReward = {
  id: string
  productName: string
  voucherCode: string
  expiresAt: string
  state: ProductRewardState
  isAvailable: boolean
  unavailableReason?: string
}

type WalletBalance = {
  availableAmount: string
  pendingAmount: string
  productRewards?: CheckoutProductReward[]
}

const rewardStatuses: Record<ProductRewardState, string> = {
  available: 'Disponivel',
  pending: 'Pendente',
  reserved: 'Reservado',
  consumed: 'Utilizado',
  expired: 'Expirado',
  reversed: 'Estornado',
  suspended: 'Suspenso',
}
const canUseReward = (reward: CheckoutProductReward) =>
  reward.isAvailable &&
  reward.state === 'available' &&
  new Date(reward.expiresAt).getTime() > Date.now()

type Props = {
  storeSlug: string
  phone: string
  total: string
  value: string
  onChange: (amount: string) => void
  productRewardId: string | null
  onProductRewardChange: (id: string | null) => void
}
const currency = (amount: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(amount))

export function CheckoutWallet({
  storeSlug,
  phone,
  total,
  value,
  onChange,
  productRewardId,
  onProductRewardChange,
}: Props) {
  const identity = `${storeSlug}:${phone.replace(/\D/g, '')}`
  const current = useRef(identity)
  current.current = identity
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const operation = useRef(0)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onProductRewardChangeRef = useRef(onProductRewardChange)
  onProductRewardChangeRef.current = onProductRewardChange
  const previousIdentity = useRef(identity)

  useEffect(() => {
    const activeOperations = operation
    // A checkout remount keeps the parent's selection until a fresh wallet read.
    if (previousIdentity.current !== identity) {
      previousIdentity.current = identity
      onProductRewardChangeRef.current(null)
    }
    operation.current++
    setChallengeId(null)
    setCode('')
    setAmount('')
    setBalance(null)
    setMessage(null)
    setBusy(false)
    setCooldown(0)
    onChangeRef.current('0.00')
    return () => {
      activeOperations.current++
    }
  }, [identity])

  useEffect(() => {
    if (!balance || !productRewardId) return
    const selected = balance.productRewards?.find(
      reward => reward.id === productRewardId
    )
    if (!selected || !canUseReward(selected)) {
      onProductRewardChangeRef.current(null)
    }
  }, [balance, productRewardId])

  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(
      () => setCooldown(value => Math.max(0, value - 1)),
      1000
    )
    return () => clearTimeout(timer)
  }, [cooldown])

  useEffect(() => {
    if (
      Number(value) > Number(total) ||
      (balance && Number(value) > Number(balance.availableAmount))
    ) {
      onChangeRef.current('0.00')
      setMessage(
        'O total ou saldo mudou. Escolha novamente o valor do cashback.'
      )
    }
  }, [value, total, balance])

  const run = async (action: (isCurrent: () => boolean) => Promise<void>) => {
    const started = identity
    const id = ++operation.current
    const isCurrent = () =>
      current.current === started && operation.current === id
    setBusy(true)
    setMessage(null)
    try {
      await action(isCurrent)
    } catch {
      if (isCurrent()) {
        setBalance(null)
        onChangeRef.current('0.00')
        onProductRewardChangeRef.current(null)
        setMessage('Nao foi possivel acessar a carteira. Tente novamente.')
      }
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }

  const refresh = async (isCurrent: () => boolean) => {
    const result = await getWalletBalance({ storeSlug, phone })
    if (!isCurrent()) return
    if (result.ok) setBalance(result)
    else {
      setBalance(null)
      onChangeRef.current('0.00')
      onProductRewardChangeRef.current(null)
      setMessage(result.message)
    }
  }

  const request = () =>
    run(async isCurrent => {
      const result = await requestWalletCode({ storeSlug, phone })
      if (!isCurrent()) return
      if (result.ok) {
        setChallengeId(result.challengeId)
        setCode('')
        setCooldown(60)
        setMessage(
          'Confira seu WhatsApp e informe o codigo recebido. Se nao chegar, aguarde para tentar novamente.'
        )
      } else {
        setBalance(null)
        onProductRewardChangeRef.current(null)
        setMessage(result.message)
        setCooldown(result.retryAfterSeconds ?? 0)
      }
    })

  const verify = () =>
    run(async isCurrent => {
      if (!challengeId) return
      const result = await verifyWalletCode({
        storeSlug,
        phone,
        challengeId,
        code,
      })
      if (!isCurrent()) return
      setCode('')
      if (!result.ok) {
        setBalance(null)
        onProductRewardChangeRef.current(null)
        setMessage(result.message)
        return
      }
      setChallengeId(null)
      await refresh(isCurrent)
    })

  const apply = (requested: string) => {
    const parsed = walletInputAmount(requested)
    if (
      !parsed ||
      Number(parsed) <= 0 ||
      Number(parsed) > Number(total) ||
      Number(parsed) > Number(balance?.availableAmount ?? 0)
    ) {
      setMessage(
        'Informe um valor dentro do saldo disponivel e do total do pedido.'
      )
      return
    }
    onChange(parsed)
    setMessage(null)
  }

  return (
    <section className="border-y py-4" aria-labelledby="checkout-wallet-title">
      <div className="flex items-center justify-between gap-3">
        <h3
          id="checkout-wallet-title"
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Wallet className="size-4" aria-hidden />
          Meus beneficios
        </h3>
        {balance && (
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              type="button"
              title="Atualizar saldo"
              aria-label="Atualizar saldo"
              disabled={busy}
              onClick={() => run(refresh)}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              type="button"
              title="Sair da carteira"
              aria-label="Sair da carteira"
              disabled={busy}
              onClick={() =>
                run(async isCurrent => {
                  onProductRewardChangeRef.current(null)
                  const result = await clearWalletSession({ storeSlug })
                  if (isCurrent()) {
                    onChangeRef.current('0.00')
                    setBalance(null)
                    if (!result.ok) {
                      setMessage(
                        'Nao foi possivel sair da carteira. Tente novamente.'
                      )
                      return
                    }
                  }
                })
              }
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        )}
      </div>
      {balance ? (
        <div className="mt-3 space-y-3">
          <h4 className="text-sm font-medium">Cashback</h4>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Disponivel</dt>
              <dd className="font-semibold">
                {currency(balance.availableAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pendente</dt>
              <dd>{currency(balance.pendingAmount)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm">
              Valor a usar
              <Input
                className="mt-1"
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                placeholder="0,00"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => apply(amount)}
            >
              Aplicar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || Number(balance.availableAmount) <= 0}
              onClick={() =>
                apply(
                  Math.min(
                    Number(total),
                    Number(balance.availableAmount)
                  ).toFixed(2)
                )
              }
            >
              Usar saldo
            </Button>
          </div>
          {Number(value) > 0 && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{currency(value)} aplicado</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Remover cashback"
                aria-label="Remover cashback"
                onClick={() => onChange('0.00')}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
          {!!balance.productRewards?.length && (
            <fieldset className="min-w-0 space-y-3 border-t pt-3">
              <legend className="text-sm font-medium">Produtos-premio</legend>
              {balance.productRewards.map(reward => {
                const available = canUseReward(reward)
                const expiresAt = new Date(reward.expiresAt)
                return (
                  <label
                    key={reward.id}
                    className="flex min-w-0 items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={productRewardId === reward.id}
                      disabled={busy || !available}
                      aria-label={`Usar premio ${reward.productName}, voucher ${reward.voucherCode}`}
                      onChange={event => {
                        if (busy || !canUseReward(reward)) return
                        onProductRewardChangeRef.current(
                          event.target.checked ? reward.id : null
                        )
                      }}
                    />
                    <span className="min-w-0 space-y-1 break-words">
                      <span className="block font-medium">
                        {reward.productName}
                      </span>
                      <span className="block text-muted-foreground">
                        Voucher: {reward.voucherCode}
                      </span>
                      <span className="block text-muted-foreground">
                        Validade:{' '}
                        {Number.isNaN(expiresAt.getTime()) ? (
                          'Indisponivel'
                        ) : (
                          <time dateTime={reward.expiresAt}>
                            {expiresAt.toLocaleString('pt-BR')}
                          </time>
                        )}
                      </span>
                      <span className="block text-muted-foreground">
                        {rewardStatuses[reward.state]}
                        {!available && (
                          <>
                            {' '}
                            -{' '}
                            {reward.unavailableReason ||
                              'Indisponivel para este pedido'}
                          </>
                        )}
                      </span>
                    </span>
                  </label>
                )
              })}
            </fieldset>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={
                busy || phone.replace(/\D/g, '').length < 10 || cooldown > 0
              }
              onClick={request}
            >
              <ShieldCheck className="mr-2 size-4" />
              {cooldown
                ? `Reenviar em ${cooldown}s`
                : 'Receber codigo no WhatsApp'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => run(refresh)}
            >
              Acessar carteira
            </Button>
          </div>
          {challengeId && (
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1 text-sm">
                Codigo de verificacao
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={event =>
                    setCode(event.target.value.replace(/\D/g, ''))
                  }
                />
              </label>
              <Button
                type="button"
                disabled={busy || code.length !== 6}
                onClick={verify}
              >
                Confirmar
              </Button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
