'use client'

import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

function IFoodAuthorizeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userCode = searchParams.get('userCode')
  const verificationUrl = searchParams.get('verificationUrl')

  const [authorizationCode, setAuthorizationCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [merchants, setMerchants] = useState<
    Array<{ id: string; name: string; corporateName: string }>
  >([])
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('')
  const [tokens, setTokens] = useState<{
    accessToken: string
    refreshToken: string
    expiresIn: number
  } | null>(null)

  const handleCopyUserCode = () => {
    if (userCode) {
      navigator.clipboard.writeText(userCode)
      toast.success('Código copiado para a área de transferência')
    }
  }

  const handleOpenPortal = () => {
    if (verificationUrl) {
      window.open(verificationUrl, '_blank')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!authorizationCode.trim()) {
      toast.error('Por favor, insira o código de autorização')
      return
    }

    const verifier = sessionStorage.getItem('ifood_verifier')

    if (!verifier) {
      toast.error('Sessão expirada. Por favor, tente conectar novamente.')
      router.push('/settings/integracoes')
      return
    }

    setIsSubmitting(true)

    try {
      // Step 1: Exchange authorization code for tokens and get merchants
      const response = await fetch('/api/integrations/ifood/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorizationCode: authorizationCode.trim(),
          authorizationCodeVerifier: verifier,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to exchange token')
      }

      const data = await response.json()

      // Store tokens temporarily
      setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
      })

      // Show merchants list
      setMerchants(data.merchants)

      // If only one merchant, auto-select it
      if (data.merchants.length === 1) {
        setSelectedMerchantId(data.merchants[0].id)
      }

      toast.success('Código validado! Selecione o restaurante para conectar.')
    } catch (error) {
      console.error('Error exchanging token:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Erro ao validar código. Verifique o código de autorização.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConnectMerchant = async () => {
    if (!selectedMerchantId) {
      toast.error('Por favor, selecione um restaurante')
      return
    }

    const storeId = sessionStorage.getItem('ifood_store_id')

    if (!storeId || !tokens) {
      toast.error('Sessão expirada. Por favor, tente conectar novamente.')
      router.push('/settings/integracoes')
      return
    }

    setIsSubmitting(true)

    try {
      // Step 2: Connect with selected merchant
      const response = await fetch('/api/integrations/ifood/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: parseInt(storeId),
          merchantId: selectedMerchantId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to connect merchant')
      }

      // Clear session storage
      sessionStorage.removeItem('ifood_verifier')
      sessionStorage.removeItem('ifood_store_id')

      toast.success('iFood conectado com sucesso!')
      router.push('/settings/integracoes')
    } catch (error) {
      console.error('Error connecting merchant:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Erro ao conectar restaurante.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!userCode || !verificationUrl) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-lg font-semibold text-red-800">
          Erro na configuração
        </h3>
        <p className="mt-2 text-sm text-red-600">
          Parâmetros de autenticação inválidos. Por favor, tente conectar
          novamente.
        </p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => router.push('/settings/integracoes')}
        >
          Voltar para Integrações
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Conectar iFood</h2>
        <p className="mt-2 text-sm text-gray-600">
          Siga os passos abaixo para autorizar o acesso ao seu cardápio do
          iFood.
        </p>
      </div>

      {/* Step 1: Display userCode */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            1
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900">
              Copie o código de usuário
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              Este código será usado para autorizar o aplicativo no Portal do
              Parceiro iFood.
            </p>

            <div className="mt-4 flex items-center gap-2">
              <div className="flex-1 rounded-md bg-white px-4 py-3 font-mono text-2xl font-bold tracking-wider text-gray-900">
                {userCode}
              </div>
              <Button variant="outline" onClick={handleCopyUserCode}>
                Copiar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: Open Portal */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            2
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900">
              Acesse o Portal do Parceiro
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              Clique no botão abaixo para abrir o Portal do Parceiro iFood em
              uma nova aba.
            </p>

            <Button className="mt-4" onClick={handleOpenPortal}>
              Abrir Portal do Parceiro
            </Button>

            <p className="mt-3 text-xs text-blue-600">
              No portal, procure por &quot;Ativar aplicativo via código&quot;
              ou &quot;Autorizar Aplicativo&quot; no menu de Aplicações.
            </p>
          </div>
        </div>
      </div>

      {/* Step 3: Enter authorization code */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            3
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900">
              Cole o código de autorização
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              Após autorizar no portal, você receberá um código de autorização.
              Cole-o abaixo para finalizar a conexão.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <Label>
                <span className="text-sm font-medium text-gray-700">
                  Código de Autorização
                </span>
                <Input
                  type="text"
                  value={authorizationCode}
                  onChange={(e) => setAuthorizationCode(e.target.value)}
                  placeholder="Cole o código aqui..."
                  disabled={isSubmitting}
                  className="mt-1 font-mono"
                />
              </Label>

              <div className="flex gap-2">
                <Button type="submit" disabled={isSubmitting || merchants.length > 0}>
                  {isSubmitting ? 'Validando...' : 'Validar Código'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/settings/integracoes')}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Step 4: Select merchant (shown after token exchange) */}
      {merchants.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
              4
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-green-900">
                Selecione o restaurante
              </h3>
              <p className="mt-1 text-sm text-green-700">
                {merchants.length === 1
                  ? 'Confirme o restaurante para conectar:'
                  : 'Você tem acesso a múltiplos restaurantes. Selecione qual deseja conectar:'}
              </p>

              <div className="mt-4 space-y-2">
                {merchants.map((merchant) => (
                  <label
                    key={merchant.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-green-300 bg-white p-4 transition-colors hover:bg-green-50"
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

              <Button
                className="mt-4"
                onClick={handleConnectMerchant}
                disabled={!selectedMerchantId || isSubmitting}
              >
                {isSubmitting ? 'Conectando...' : 'Conectar Restaurante'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Help section */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">
          <strong>Precisa de ajuda?</strong> Se você não conseguir encontrar a
          opção de autorização no Portal do Parceiro, entre em contato com o
          suporte do iFood.
        </p>
      </div>
    </div>
  )
}

export default function IFoodAuthorizePage() {
  return (
    <>
      <AdminPageInfo
        pageInfo={{
          title: 'Autorizar iFood',
        }}
      />
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-12">
            <p className="text-gray-500">Carregando...</p>
          </div>
        }
      >
        <IFoodAuthorizeContent />
      </Suspense>
    </>
  )
}
