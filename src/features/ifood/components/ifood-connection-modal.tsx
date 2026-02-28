'use client'

import { exchangeIFoodAuthCode, initiateIFoodOAuth } from '@/features/ifood/api'
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
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

interface IFoodConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
  onSuccess: () => void
}

type Step = 'userCode' | 'authCode' | 'selectMerchant'

interface Merchant {
  id: string
  name: string
  corporateName: string
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
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [selectedMerchantId, setSelectedMerchantId] = useState('')
  // Tokens are now stored server-side in the OAuth session - not exposed to client

  const resetState = useCallback(() => {
    setStep('userCode')
    setIsLoading(false)
    setUserCode('')
    setVerificationUrl('')
    setAuthorizationCode('')
    setMerchants([])
    setSelectedMerchantId('')
  }, [])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState()
    }
    onOpenChange(newOpen)
  }

  // Step 1: Initiate OAuth and get userCode using server action
  // The authorizationCodeVerifier is stored server-side and never exposed to the client
  const initiateConnection = useCallback(async () => {
    setIsLoading(true)
    try {
      // Use server action - verifier is stored server-side automatically
      const data = await initiateIFoodOAuth(storeId)
      setUserCode(data.userCode)
      setVerificationUrl(data.verificationUrl)
    } catch (error) {
      console.error('Error initiating iFood connection:', error)
      toast.error('Erro ao iniciar conexao com iFood')
      handleOpenChange(false)
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  // When modal opens, initiate connection
  const handleModalOpen = useCallback(() => {
    if (open && !userCode && !isLoading) {
      initiateConnection()
    }
  }, [open, userCode, isLoading, initiateConnection])

  // Call initiateConnection when modal opens
  if (open && !userCode && !isLoading && step === 'userCode') {
    initiateConnection()
  }

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
      toast.error('Por favor, insira o codigo de autorizacao')
      return
    }

    setIsLoading(true)

    try {
      // Use server action - verifier is retrieved server-side from DB
      // Tokens are stored server-side (encrypted in OAuth session), NOT returned to client
      const data = await exchangeIFoodAuthCode(storeId, authorizationCode.trim())

      setMerchants(data.merchants)

      if (data.merchants.length === 1) {
        setSelectedMerchantId(data.merchants[0].id)
      }

      setStep('selectMerchant')
      toast.success('Codigo validado! Selecione o restaurante para conectar.')
    } catch (error) {
      console.error('Error exchanging token:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Erro ao validar codigo. Verifique o codigo de autorizacao.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnectMerchant = async () => {
    if (!selectedMerchantId) {
      toast.error('Por favor, selecione um restaurante')
      return
    }

    setIsLoading(true)

    try {
      // TODO: This will be replaced with completeIFoodConnection (feature #20)
      // which reads tokens from the OAuth session server-side and creates the integration.
      // For now, show a placeholder message.
      toast.info('Funcionalidade em desenvolvimento. Selecao de catalogo sera adicionada em breve.')
      handleOpenChange(false)
    } catch (error) {
      console.error('Error connecting merchant:', error)
      toast.error(
        error instanceof Error ? error.message : 'Erro ao conectar restaurante.'
      )
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

        {isLoading && !userCode ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-gray-500">Iniciando conexao...</p>
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
                    autorizacao. Cole-o abaixo para finalizar a conexao.
                  </p>

                  <form onSubmit={handleSubmitAuthCode} className="mt-3 space-y-3">
                    <Label>
                      <span className="text-sm font-medium text-gray-700">
                        Codigo de Autorizacao
                      </span>
                      <Input
                        type="text"
                        value={authorizationCode}
                        onChange={(e) => setAuthorizationCode(e.target.value)}
                        placeholder="Cole o codigo aqui..."
                        disabled={isLoading}
                        className="mt-1 font-mono"
                      />
                    </Label>

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
                          checked={selectedMerchantId === merchant.id}
                          onChange={(e) => setSelectedMerchantId(e.target.value)}
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
                      onClick={handleConnectMerchant}
                      disabled={!selectedMerchantId || isLoading}
                    >
                      {isLoading ? 'Conectando...' : 'Conectar Restaurante'}
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
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
