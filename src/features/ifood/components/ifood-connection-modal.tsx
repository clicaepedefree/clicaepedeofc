'use client'

import {
  completeIFoodConnection,
  exchangeIFoodAuthCode,
  getMerchantCatalogs,
  initiateIFoodOAuth,
} from '@/features/ifood/api'
import { Button } from '@/shared/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/dialog'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { LoadingSpinner } from '@/shared/spinner'
import { CheckCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface IFoodConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
  onSuccess: () => void
}

type Step = 'userCode' | 'authCode' | 'selectMerchant' | 'selectCatalog' | 'success'

interface Merchant {
  id: string
  name: string
  corporateName: string
}

interface Catalog {
  id: string
  name: string
  status: string
  type: string
}

export function IFoodConnectionModal({
  open,
  onOpenChange,
  storeId,
  onSuccess,
}: IFoodConnectionModalProps) {
  const [step, setStep] = useState<Step>('userCode')
  const [isLoading, setIsLoading] = useState(false)
  const [userCode, setUserCode] = useState('')
  const [verificationUrl, setVerificationUrl] = useState('')
  const [authorizationCode, setAuthorizationCode] = useState('')
  const [authCodeError, setAuthCodeError] = useState<string | null>(null)
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [catalogs, setCatalogs] = useState<Catalog[]>([])
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [initiationError, setInitiationError] = useState<string | null>(null)

  // Ref to track if OAuth initiation has been triggered for the current modal session
  const initiatedRef = useRef(false)

  const resetState = useCallback(() => {
    setStep('userCode')
    setIsLoading(false)
    setUserCode('')
    setVerificationUrl('')
    setAuthorizationCode('')
    setAuthCodeError(null)
    setMerchants([])
    setSelectedMerchant(null)
    setCatalogs([])
    setSelectedCatalog(null)
    setConnectionError(null)
    setInitiationError(null)
    initiatedRef.current = false // Reset initiation flag on modal close
  }, [])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState()
    }
    onOpenChange(newOpen)
  }

  // Step 1: Initiate OAuth and get userCode using server action
  const initiateConnection = useCallback(async () => {
    setIsLoading(true)
    setInitiationError(null) // Clear any previous error
    try {
      const data = await initiateIFoodOAuth(storeId)
      setUserCode(data.userCode)
      setVerificationUrl(data.verificationUrl)
      setInitiationError(null) // Clear error on success
    } catch (error) {
      console.error('Error initiating iFood connection:', error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Erro ao iniciar conexao com iFood. O servico do iFood pode estar indisponivel.'
      setInitiationError(errorMessage)
      // Modal stays open for retry - do NOT call handleOpenChange(false)
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  // Retry initiation after error
  const handleRetryInitiation = () => {
    initiatedRef.current = false // Allow re-initiation
    setInitiationError(null)
    initiateConnection()
  }

  // Call initiateConnection when modal opens - using useEffect to avoid side effects in render
  // The initiatedRef ensures we only call the API once per modal session, preventing
  // duplicate API calls from rapid clicks or React StrictMode double-renders
  useEffect(() => {
    if (open && !initiatedRef.current && step === 'userCode') {
      initiatedRef.current = true
      initiateConnection()
    }
  }, [open, step, initiateConnection])

  const handleCopyUserCode = () => {
    if (userCode) {
      navigator.clipboard.writeText(userCode)
      toast.success('Codigo copiado para a area de transferencia')
    }
  }

  const handleOpenPortal = () => {
    if (verificationUrl) {
      window.open(verificationUrl, '_blank')
    }
  }

  const handleSubmitAuthCode = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!authorizationCode.trim()) {
      setAuthCodeError('Por favor, insira o codigo de autorizacao')
      return
    }

    setIsLoading(true)
    setAuthCodeError(null) // Clear any previous error before attempting

    try {
      // Tokens are stored server-side (encrypted in OAuth session), NOT returned to client
      const data = await exchangeIFoodAuthCode(storeId, authorizationCode.trim())

      setMerchants(data.merchants)
      // No merchant is pre-selected by default - user must explicitly select
      setSelectedMerchant(null)

      setAuthCodeError(null) // Clear error on success
      setStep('selectMerchant')
      toast.success('Codigo validado! Selecione o restaurante para conectar.')
    } catch (error) {
      console.error('Error exchanging token:', error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Erro ao validar codigo. Verifique o codigo de autorizacao.'
      setAuthCodeError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectMerchant = (merchant: Merchant) => {
    setSelectedMerchant(merchant)
  }

  const handleContinueToCatalogs = async () => {
    if (!selectedMerchant) {
      toast.error('Por favor, selecione um restaurante')
      return
    }

    setIsLoading(true)

    try {
      // Fetch catalogs using tokens from OAuth session
      const data = await getMerchantCatalogs(storeId, selectedMerchant.id)

      setCatalogs(data.catalogs)
      // No catalog is pre-selected by default - user must explicitly select
      setSelectedCatalog(null)

      setStep('selectCatalog')
      toast.success('Catalogos carregados! Selecione qual deseja usar.')
    } catch (error) {
      console.error('Error fetching catalogs:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Erro ao carregar catalogos. Tente novamente.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectCatalog = (catalog: Catalog) => {
    setSelectedCatalog(catalog)
    if (connectionError) {
      setConnectionError(null) // Clear error when user changes selection
    }
  }

  const handleCompleteConnection = async () => {
    if (!selectedMerchant || !selectedCatalog) {
      setConnectionError('Por favor, selecione um restaurante e um catalogo')
      return
    }

    setIsLoading(true)
    setConnectionError(null) // Clear any previous error before attempting

    try {
      // Complete the connection - tokens are read from OAuth session server-side
      await completeIFoodConnection(
        storeId,
        selectedMerchant.id,
        selectedCatalog.id,
        selectedCatalog.name,
        selectedMerchant.name
      )

      setConnectionError(null) // Clear error on success
      toast.success('iFood conectado com sucesso!')
      setStep('success')
      onSuccess() // Trigger refresh of the connection card
    } catch (error) {
      console.error('Error completing connection:', error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Erro ao conectar. Tente novamente.'
      setConnectionError(errorMessage)
      // Selections (merchant, catalog) are preserved - user can retry
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conectar iFood</DialogTitle>
          <DialogDescription>
            Siga os passos abaixo para autorizar o acesso ao seu cardapio do
            iFood.
          </DialogDescription>
        </DialogHeader>

        {isLoading && !userCode && !initiationError ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <LoadingSpinner size={32} />
            <p className="text-gray-500">Iniciando conexao...</p>
          </div>
        ) : initiationError ? (
          <div className="space-y-4">
            {/* Initiation Error State */}
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <svg
                    className="h-10 w-10 text-red-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-semibold text-red-900">
                  Erro ao conectar
                </h3>
                <p className="mt-2 text-sm text-red-700">
                  {initiationError}
                </p>

                <div className="mt-6 flex gap-3">
                  <Button onClick={handleRetryInitiation} disabled={isLoading}>
                    {isLoading ? 'Tentando...' : 'Tentar Novamente'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={isLoading}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : step === 'userCode' || step === 'authCode' ? (
          <div className="space-y-4">
            {/* Step 1: Display userCode */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900">
                    Copie o codigo de usuario
                  </h3>
                  <p className="mt-1 text-sm text-blue-700">
                    Este codigo sera usado para autorizar o aplicativo no Portal
                    do Parceiro iFood.
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 rounded-md bg-white px-4 py-2 font-mono text-xl font-bold tracking-wider text-gray-900">
                      {userCode || '---'}
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleCopyUserCode}
                      disabled={!userCode}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Open Portal */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900">
                    Acesse o Portal do Parceiro
                  </h3>
                  <p className="mt-1 text-sm text-blue-700">
                    Clique no botao abaixo para abrir o Portal do Parceiro iFood
                    em uma nova aba.
                  </p>

                  <Button
                    className="mt-3"
                    onClick={handleOpenPortal}
                    disabled={!verificationUrl}
                  >
                    Abrir Portal do Parceiro
                  </Button>

                  <p className="mt-2 text-xs text-blue-600">
                    No portal, procure por &quot;Ativar aplicativo via
                    codigo&quot; ou &quot;Autorizar Aplicativo&quot; no menu de
                    Aplicacoes.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3: Enter authorization code */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900">
                    Cole o codigo de autorizacao
                  </h3>
                  <p className="mt-1 text-sm text-blue-700">
                    Apos autorizar no portal, voce recebera um codigo de
                    autorizacao. Cole-o abaixo para continuar.
                  </p>

                  <form onSubmit={handleSubmitAuthCode} className="mt-3 space-y-3">
                    <Label>
                      <span className="text-sm font-medium text-gray-700">
                        Codigo de Autorizacao
                      </span>
                      <Input
                        type="text"
                        value={authorizationCode}
                        onChange={(e) => {
                          setAuthorizationCode(e.target.value)
                          if (authCodeError) {
                            setAuthCodeError(null) // Clear error when user starts typing
                          }
                        }}
                        placeholder="Cole o codigo aqui..."
                        disabled={isLoading}
                        className={`mt-1 font-mono ${authCodeError ? 'border-red-500 focus:ring-red-500' : ''}`}
                        aria-invalid={!!authCodeError}
                        aria-describedby={authCodeError ? 'auth-code-error' : undefined}
                      />
                    </Label>

                    {authCodeError && (
                      <div
                        id="auth-code-error"
                        className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
                        role="alert"
                      >
                        {authCodeError}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? 'Validando...' : 'Validar Codigo'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                        disabled={isLoading}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : step === 'selectMerchant' ? (
          <div className="space-y-4">
            {/* Step 4: Select merchant */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900">
                    Selecione o restaurante
                  </h3>
                  <p className="mt-1 text-sm text-green-700">
                    {merchants.length === 1
                      ? 'Confirme o restaurante para conectar:'
                      : 'Voce tem acesso a multiplos restaurantes. Selecione qual deseja conectar:'}
                  </p>

                  <div className="mt-3 space-y-2">
                    {merchants.map((merchant) => (
                      <label
                        key={merchant.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-green-300 bg-white p-3 transition-colors hover:bg-green-50"
                      >
                        <input
                          type="radio"
                          name="merchant"
                          value={merchant.id}
                          checked={selectedMerchant?.id === merchant.id}
                          onChange={() => handleSelectMerchant(merchant)}
                          className="h-4 w-4 text-green-600"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {merchant.name}
                          </div>
                          {merchant.corporateName && (
                            <div className="text-sm text-gray-600">
                              {merchant.corporateName}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={handleContinueToCatalogs}
                      disabled={!selectedMerchant || isLoading}
                    >
                      {isLoading ? 'Carregando...' : 'Continuar'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleOpenChange(false)}
                      disabled={isLoading}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : step === 'selectCatalog' ? (
          <div className="space-y-4">
            {/* Step 5: Select catalog */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
                  5
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900">
                    Selecione o catalogo
                  </h3>
                  <p className="mt-1 text-sm text-green-700">
                    {catalogs.length === 1
                      ? 'Confirme o catalogo para sincronizar:'
                      : 'Selecione qual catalogo deseja sincronizar com o sistema:'}
                  </p>

                  <div className="mt-3 space-y-2">
                    {catalogs.map((catalog) => (
                      <label
                        key={catalog.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-green-300 bg-white p-3 transition-colors hover:bg-green-50"
                      >
                        <input
                          type="radio"
                          name="catalog"
                          value={catalog.id}
                          checked={selectedCatalog?.id === catalog.id}
                          onChange={() => handleSelectCatalog(catalog)}
                          className="h-4 w-4 text-green-600"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {catalog.name}
                          </div>
                          <div className="text-sm text-gray-600">
                            {catalog.type} - {catalog.status}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {catalogs.length === 0 && (
                    <div className="mt-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      Nenhum catalogo encontrado para este restaurante. Verifique se
                      o cardapio esta configurado no iFood.
                    </div>
                  )}

                  {connectionError && (
                    <div
                      id="connection-error"
                      className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
                      role="alert"
                    >
                      {connectionError}
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={handleCompleteConnection}
                      disabled={!selectedCatalog || isLoading}
                    >
                      {isLoading ? 'Conectando...' : (connectionError ? 'Tentar Novamente' : 'Conectar')}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setConnectionError(null) // Clear error when going back
                        setStep('selectMerchant')
                      }}
                      disabled={isLoading}
                    >
                      Voltar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleOpenChange(false)}
                      disabled={isLoading}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : step === 'success' ? (
          <div className="space-y-4">
            {/* Success State */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-green-900">
                  Conexao estabelecida com sucesso!
                </h3>
                <p className="mt-2 text-sm text-green-700">
                  Sua conta iFood foi conectada ao sistema. Agora voce pode
                  sincronizar seu cardapio.
                </p>

                <div className="mt-4 w-full max-w-sm space-y-2 rounded-md bg-white p-4 border border-green-200">
                  {selectedMerchant && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Loja:</span>
                      <span className="font-medium text-gray-900">
                        {selectedMerchant.name}
                      </span>
                    </div>
                  )}
                  {selectedCatalog && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cardapio:</span>
                      <span className="font-medium text-gray-900">
                        {selectedCatalog.name}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <Button onClick={() => handleOpenChange(false)}>
                    Concluir
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
