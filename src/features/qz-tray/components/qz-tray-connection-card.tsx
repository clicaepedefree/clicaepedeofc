'use client'

import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Label } from '@/shared/label'
import { Switch } from '@/shared/switch'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { AlertTriangle, ExternalLink, Printer, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useQzTray } from '../hooks/use-qz-tray'
import { QzTrayConnectionModal } from './qz-tray-connection-modal'
import { QzTrayPrinterSelect } from './qz-tray-printer-select'

const QZ_TRAY_DOWNLOAD_URL = 'https://qz.io/'

export function QzTrayConnectionCard() {
  const {
    status,
    isConnected,
    isEnabled,
    printers,
    selectedPrinter,
    autoPrint,
    disconnect,
    refreshPrinters,
    selectPrinter,
    printTest,
    setEnabled,
    setAutoPrint,
  } = useQzTray()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isTestingPrint, setIsTestingPrint] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleOpenSetup = () => {
    setIsModalOpen(true)
  }

  const handleSetupSuccess = (printer: string) => {
    // Enable QZ Tray and set the selected printer
    setEnabled(true)
    selectPrinter(printer)
    toast.success('QZ Tray configurado com sucesso!')
  }

  const handleRefreshPrinters = async () => {
    setIsRefreshing(true)
    try {
      await refreshPrinters()
      toast.success('Lista de impressoras atualizada')
    } catch {
      toast.error('Erro ao atualizar impressoras')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleTestPrint = async () => {
    setIsTestingPrint(true)
    try {
      await printTest()
      toast.success('Impressao de teste enviada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao imprimir')
    } finally {
      setIsTestingPrint(false)
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
    setEnabled(false)
    toast.info('QZ Tray desconectado')
  }

  const getStatusBadge = () => {
    if (!isEnabled) {
      return <Badge variant="secondary">Desativado</Badge>
    }

    // Connected but no printer selected - warning state
    if (isConnected && !selectedPrinter) {
      return (
        <Badge variant="default" className="bg-yellow-100 text-yellow-800">
          Atencao
        </Badge>
      )
    }

    switch (status) {
      case 'connected':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Conectado
          </Badge>
        )
      case 'connecting':
        return <Badge variant="secondary">Conectando...</Badge>
      case 'error':
        return <Badge variant="destructive">Erro</Badge>
      default:
        return <Badge variant="secondary">Desconectado</Badge>
    }
  }

  // Not enabled - show setup button
  const showSetupState = !isEnabled

  // Enabled and connected but missing printer
  const showWarningState = isEnabled && isConnected && !selectedPrinter

  // Enabled and fully configured
  const showConnectedState = isEnabled && isConnected && selectedPrinter

  return (
    <>
      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Printer className="h-5 w-5 text-muted-foreground" />
              <Headline variant={500}>QZ Tray</Headline>
              {getStatusBadge()}
            </div>
          </div>

          {/* Description */}
          <Body variant={200} fontWeight="regular" className="text-muted-foreground">
            Impressao automatica via QZ Tray. Instale o{' '}
            <a
              href={QZ_TRAY_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              QZ Tray
              <ExternalLink className="h-3 w-3" />
            </a>{' '}
            para imprimir recibos sem dialogo de impressao.
          </Body>

          {/* Setup State - Not enabled */}
          {showSetupState && (
            <div className="pt-2">
              <Button onClick={handleOpenSetup}>Configurar QZ Tray</Button>
            </div>
          )}

          {/* Warning State - Connected but no printer */}
          {showWarningState && (
            <>
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Selecione uma impressora
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Para finalizar a configuracao, selecione a impressora que
                      sera usada para imprimir recibos.
                    </p>
                  </div>
                </div>
              </div>

              {/* Printer Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Impressora</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshPrinters}
                    disabled={isRefreshing}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </div>
                <QzTrayPrinterSelect
                  printers={printers}
                  selectedPrinter={selectedPrinter}
                  onSelect={selectPrinter}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={handleDisconnect}>
                  Desconectar
                </Button>
              </div>
            </>
          )}

          {/* Connected State - Fully configured */}
          {showConnectedState && (
            <>
              {/* Printer Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Impressora</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshPrinters}
                    disabled={isRefreshing}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </div>
                <QzTrayPrinterSelect
                  printers={printers}
                  selectedPrinter={selectedPrinter}
                  onSelect={selectPrinter}
                />
              </div>

              {/* Auto Print Toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-print" className="cursor-pointer">
                  Imprimir automaticamente
                </Label>
                <Switch
                  id="auto-print"
                  checked={autoPrint}
                  onCheckedChange={setAutoPrint}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={handleTestPrint}
                  disabled={isTestingPrint}
                >
                  {isTestingPrint ? 'Imprimindo...' : 'Imprimir Teste'}
                </Button>
                <Button variant="outline" onClick={handleDisconnect}>
                  Desconectar
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Connection Modal */}
      <QzTrayConnectionModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSuccess={handleSetupSuccess}
      />
    </>
  )
}
