'use client'

import { Button } from '@/shared/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/dialog'
import { LoadingSpinner } from '@/shared/spinner'
import { cn } from '@/shared/lib/utils'
import {
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Printer,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getQzTrayClient } from '../lib/qz-tray-client'

interface QzTrayConnectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (selectedPrinter: string) => void
}

type Step = 'connect' | 'certificate' | 'printer' | 'success'

function getDisplayStep(step: Step): 1 | 2 | 3 {
  if (step === 'connect') return 1
  if (step === 'certificate') return 2
  return 3 // printer or success
}

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = [
    { number: 1, label: 'Conectar' },
    { number: 2, label: 'Certificado' },
    { number: 3, label: 'Impressora' },
  ]

  return (
    <div className="flex items-center justify-center gap-2 mb-4 pb-4 border-b">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-2',
              step.number === currentStep
                ? 'text-primary font-medium'
                : 'text-muted-foreground'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                step.number < currentStep &&
                  'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                step.number === currentStep &&
                  'bg-primary text-primary-foreground',
                step.number > currentStep && 'bg-muted text-muted-foreground'
              )}
            >
              {step.number < currentStep ? (
                <Check className="w-4 h-4" />
              ) : (
                step.number
              )}
            </div>
            <span className="hidden sm:inline text-sm">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                'w-8 h-0.5 mx-1',
                step.number < currentStep ? 'bg-green-500' : 'bg-muted'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

const QZ_TRAY_DOWNLOAD_URL = 'https://qz.io/download/'

function PrinterListLoading() {
  return (
    <div className="flex items-center justify-center py-4">
      <LoadingSpinner size={24} />
    </div>
  )
}

function PrinterListEmpty() {
  return (
    <div className="mt-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3">
      Nenhuma impressora encontrada. Verifique se ha impressoras instaladas no
      sistema.
    </div>
  )
}

interface PrinterListProps {
  printers: string[]
  selectedPrinter: string | null
  onSelect: (printer: string) => void
}

function PrinterList({ printers, selectedPrinter, onSelect }: PrinterListProps) {
  return (
    <div className="mt-3 space-y-2">
      {printers.map((printer) => (
        <label
          key={printer}
          className="flex cursor-pointer items-center gap-3 rounded-md border border-emerald-300 bg-card p-3 transition-colors hover:bg-emerald-50 dark:border-emerald-900/70 dark:hover:bg-emerald-950/30"
        >
          <input
            type="radio"
            name="printer"
            value={printer}
            checked={selectedPrinter === printer}
            onChange={() => onSelect(printer)}
            className="h-4 w-4 text-green-600"
          />
          <div className="flex-1">
            <div className="font-medium text-foreground">{printer}</div>
          </div>
        </label>
      ))}
    </div>
  )
}

interface PrinterSelectionContentProps {
  isLoading: boolean
  printers: string[]
  selectedPrinter: string | null
  onSelect: (printer: string) => void
}

function PrinterSelectionContent({
  isLoading,
  printers,
  selectedPrinter,
  onSelect,
}: PrinterSelectionContentProps) {
  if (isLoading && printers.length === 0) {
    return <PrinterListLoading />
  }

  if (printers.length === 0) {
    return <PrinterListEmpty />
  }

  return (
    <PrinterList
      printers={printers}
      selectedPrinter={selectedPrinter}
      onSelect={onSelect}
    />
  )
}

export function QzTrayConnectionModal({
  open,
  onOpenChange,
  onSuccess,
}: QzTrayConnectionModalProps) {
  const [step, setStep] = useState<Step>('connect')
  const [isLoading, setIsLoading] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [certificateChecked, setCertificateChecked] = useState(false)
  const [certificateTrusted, setCertificateTrusted] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [printers, setPrinters] = useState<string[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null)
  const [isRefreshingPrinters, setIsRefreshingPrinters] = useState(false)

  const initiatedRef = useRef(false)

  const resetState = useCallback(() => {
    setStep('connect')
    setIsLoading(false)
    setConnectionError(null)
    setCertificateChecked(false)
    setCertificateTrusted(false)
    setShowInstructions(false)
    setPrinters([])
    setSelectedPrinter(null)
    setIsRefreshingPrinters(false)
    initiatedRef.current = false
  }, [])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState()
    }
    onOpenChange(newOpen)
  }

  // Step 1: Connect to QZ Tray
  const attemptConnection = useCallback(async () => {
    setIsLoading(true)
    setConnectionError(null)

    try {
      const client = getQzTrayClient()
      await client.connect()

      // Connection successful, move to certificate step
      setStep('certificate')
      toast.success('QZ Tray conectado!')
    } catch (error) {
      console.error('QZ Tray connection error:', error)
      setConnectionError(
        'Nao foi possivel conectar ao QZ Tray. Verifique se o aplicativo esta instalado e em execucao.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Step 2: Check if certificate is trusted
  const checkCertificate = useCallback(async () => {
    setIsLoading(true)
    setCertificateChecked(false)

    try {
      const client = getQzTrayClient()
      // Try to get printers - this is a signed operation
      // If it succeeds without errors, certificate is trusted
      const availablePrinters = await client.getPrinters()

      setCertificateTrusted(true)
      setPrinters(availablePrinters)

      // Auto-advance to printer step after brief delay
      setTimeout(() => {
        setStep('printer')
      }, 1500)
    } catch (error) {
      // Certificate not trusted or signing failed
      console.log('Certificate check failed:', error)
      setCertificateTrusted(false)
    } finally {
      setCertificateChecked(true)
      setIsLoading(false)
    }
  }, [])

  // Load printers for step 3
  const loadPrinters = useCallback(async () => {
    setIsRefreshingPrinters(true)

    try {
      const client = getQzTrayClient()
      const availablePrinters = await client.getPrinters()
      setPrinters(availablePrinters)

      // If we have printers and none selected, select the first one
      if (availablePrinters.length > 0 && !selectedPrinter) {
        // Try to get default printer
        const defaultPrinter = await client.getDefaultPrinter()
        if (defaultPrinter && availablePrinters.includes(defaultPrinter)) {
          setSelectedPrinter(defaultPrinter)
        } else {
          setSelectedPrinter(availablePrinters[0])
        }
      }
    } catch (error) {
      console.error('Failed to load printers:', error)
      toast.error('Erro ao carregar impressoras')
    } finally {
      setIsRefreshingPrinters(false)
    }
  }, [selectedPrinter])

  // Handle certificate download
  const handleDownloadCertificate = () => {
    const link = document.createElement('a')
    link.href = '/qz-tray/certificate.txt'
    link.download = 'clica-pedidos-certificate.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Certificado baixado!')
    setShowInstructions(true)
  }

  // Handle completion
  const handleComplete = () => {
    if (!selectedPrinter) {
      toast.error('Selecione uma impressora')
      return
    }

    setStep('success')
  }

  const handleFinish = () => {
    if (selectedPrinter) {
      onSuccess(selectedPrinter)
    }
    handleOpenChange(false)
  }

  // Auto-connect when modal opens
  useEffect(() => {
    if (open && !initiatedRef.current && step === 'connect') {
      initiatedRef.current = true
      attemptConnection()
    }
  }, [open, step, attemptConnection])

  // Check certificate when entering certificate step
  useEffect(() => {
    if (step === 'certificate' && !certificateChecked) {
      checkCertificate()
    }
  }, [step, certificateChecked, checkCertificate])

  // Load printers when entering printer step
  useEffect(() => {
    if (step === 'printer' && printers.length === 0) {
      loadPrinters()
    }
  }, [step, printers.length, loadPrinters])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {step !== 'success' && !connectionError && (
          <StepIndicator currentStep={getDisplayStep(step)} />
        )}

        <DialogHeader>
          <DialogTitle>Configurar QZ Tray</DialogTitle>
          <DialogDescription>
            Siga os passos para configurar a impressao automatica de recibos.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Connect */}
        {step === 'connect' && (
          <div className="space-y-4">
            {isLoading && !connectionError ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <LoadingSpinner size={32} />
                <p className="text-muted-foreground">Conectando ao QZ Tray...</p>
              </div>
            ) : connectionError ? (
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
                    QZ Tray nao encontrado
                  </h3>
                  <p className="mt-2 text-sm text-red-700">{connectionError}</p>

                  <div className="mt-4 text-sm text-muted-foreground">
                    <p>Certifique-se de que:</p>
                    <ul className="mt-2 text-left list-disc list-inside">
                      <li>O QZ Tray esta instalado</li>
                      <li>O aplicativo esta em execucao (icone na bandeja)</li>
                    </ul>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <Button
                      onClick={() => {
                        initiatedRef.current = false
                        attemptConnection()
                      }}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Conectando...' : 'Tentar Novamente'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open(QZ_TRAY_DOWNLOAD_URL, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Baixar QZ Tray
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    className="mt-4"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Step 2: Certificate */}
        {step === 'certificate' && (
          <div className="space-y-4">
            {isLoading && !certificateChecked ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <LoadingSpinner size={32} />
                <p className="text-muted-foreground">Verificando certificado...</p>
              </div>
            ) : certificateTrusted ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/70 dark:bg-emerald-950/30">
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-green-900">
                    Certificado ja configurado!
                  </h3>
                  <p className="mt-2 text-sm text-green-700">
                    A impressao silenciosa esta ativada.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Info Box */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                      <Printer className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-blue-900">
                        Impressao Silenciosa (Opcional)
                      </h3>
                      <p className="mt-1 text-sm text-blue-700">
                        Importe nosso certificado para imprimir sem janelas de
                        confirmacao. Isso permite uma experiencia mais rapida.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Download Button */}
                <div className="flex justify-center">
                  <Button onClick={handleDownloadCertificate} className="gap-2">
                    <Download className="w-4 h-4" />
                    Baixar Certificado
                  </Button>
                </div>

                {/* Instructions (collapsible) */}
                <div className="rounded-lg border overflow-hidden">
                  <button
                    onClick={() => setShowInstructions(!showInstructions)}
                    className="w-full flex items-center justify-between p-3 hover:bg-accent transition-colors"
                  >
                    <span className="font-medium text-sm">
                      Como importar o certificado
                    </span>
                    {showInstructions ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {showInstructions && (
                    <div className="p-4 pt-0 border-t bg-muted/50">
                      <ol className="space-y-3 text-sm">
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
                            1
                          </span>
                          <span>
                            Clique em &quot;Baixar Certificado&quot; acima
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
                            2
                          </span>
                          <span>
                            No QZ Tray (icone na bandeja do sistema), va em{' '}
                            <strong>Advanced &gt; Site Manager</strong>
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
                            3
                          </span>
                          <span>
                            Clique no botao <strong>+</strong> e selecione{' '}
                            <strong>&quot;Browse...&quot;</strong>
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
                            4
                          </span>
                          <span>
                            Escolha o arquivo baixado e clique em{' '}
                            <strong>&quot;Trust&quot;</strong>
                          </span>
                        </li>
                      </ol>
                    </div>
                  )}
                </div>

                {/* Note */}
                <p className="text-xs text-center text-muted-foreground">
                  Sem o certificado, voce vera uma janela de confirmacao a cada
                  impressao.
                </p>

                {/* Actions */}
                <div className="flex justify-center gap-3 pt-2">
                  <Button onClick={() => setStep('printer')}>Continuar</Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Printer Selection */}
        {step === 'printer' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/30">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
                  <Printer className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-green-900">
                      Selecione a impressora
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={loadPrinters}
                      disabled={isRefreshingPrinters}
                    >
                      <RefreshCw
                        className={cn(
                          'w-4 h-4',
                          isRefreshingPrinters && 'animate-spin'
                        )}
                      />
                    </Button>
                  </div>
                  <p className="mt-1 text-sm text-green-700">
                    Escolha qual impressora sera usada para imprimir recibos.
                  </p>

                  <PrinterSelectionContent
                    isLoading={isRefreshingPrinters}
                    printers={printers}
                    selectedPrinter={selectedPrinter}
                    onSelect={setSelectedPrinter}
                  />

                  <div className="mt-4 flex gap-2">
                    <Button
                      onClick={handleComplete}
                      disabled={!selectedPrinter}
                    >
                      Conectar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setStep('certificate')}
                    >
                      Voltar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleOpenChange(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/70 dark:bg-emerald-950/30">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-green-900">
                  QZ Tray configurado com sucesso!
                </h3>
                <p className="mt-2 text-sm text-green-700">
                  Sua impressora esta pronta para imprimir recibos automaticamente.
                </p>

                <div className="mt-4 w-full max-w-sm space-y-2 rounded-md border border-emerald-200 bg-card p-4 dark:border-emerald-900/70">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Impressora:</span>
                    <span className="font-medium text-foreground">
                      {selectedPrinter}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Certificado:</span>
                    <span className="font-medium text-foreground">
                      {certificateTrusted ? 'Configurado' : 'Nao configurado'}
                    </span>
                  </div>
                </div>

                <div className="mt-6">
                  <Button onClick={handleFinish}>Concluir</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
