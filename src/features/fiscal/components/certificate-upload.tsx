'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { dispatchToast } from '@/shared/lib/toast'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { useAtom } from 'jotai'
import { FileKey, Upload, CheckCircle, AlertCircle } from 'lucide-react'
import { useState, useRef } from 'react'
import { uploadCertificate, getCertificateStatus } from '../api'
import { useFiscalConfig } from '../hooks/use-fiscal-config'

export const CertificateUpload = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { data: fiscalConfig, isLoading, invalidate } = useFiscalConfig(selectedStoreId)
  const [password, setPassword] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const validExtensions = ['.pfx', '.p12']
      const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
      if (!validExtensions.includes(fileExtension)) {
        dispatchToast({
          message: 'Arquivo inválido. Use um certificado .pfx ou .p12',
          type: 'error',
        })
        return
      }
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedStoreId || !selectedFile || !password) {
      dispatchToast({
        message: 'Selecione um arquivo e informe a senha',
        type: 'error',
      })
      return
    }

    setIsUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        await uploadCertificate(selectedStoreId, base64, password)
        invalidate()
        setSelectedFile(null)
        setPassword('')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        dispatchToast({ message: 'Certificado enviado com sucesso!', type: 'success' })
      }
      reader.onerror = () => {
        dispatchToast({
          message: 'Erro ao ler arquivo',
          type: 'error',
        })
      }
      reader.readAsDataURL(selectedFile)
    } catch (error) {
      dispatchToast({
        message: error instanceof Error ? error.message : 'Erro ao enviar certificado',
        type: 'error',
      })
    } finally {
      setIsUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  if (!fiscalConfig?.nfeioCompanyId) {
    return (
      <SettingsCategoryBlock title="Certificado Digital A1">
        <div className="col-span-4 flex items-center gap-2 text-amber-600">
          <AlertCircle className="h-5 w-5" />
          <Body>Cadastre a empresa no NFe.io antes de enviar o certificado.</Body>
        </div>
      </SettingsCategoryBlock>
    )
  }

  const certificateValidUntil = fiscalConfig.certificateValidUntil
  const hasValidCertificate = certificateValidUntil && new Date(certificateValidUntil) > new Date()

  return (
    <div className="space-y-2">
      <SettingsCategoryBlock title="Certificado Digital A1">
        {hasValidCertificate && (
          <div className="col-span-4 flex items-center gap-2 text-green-600 mb-4">
            <CheckCircle className="h-5 w-5" />
            <Body>
              Certificado válido até{' '}
              {new Date(certificateValidUntil).toLocaleDateString('pt-BR')}
            </Body>
          </div>
        )}

        <div className="col-span-2">
          <Label>
            Arquivo do certificado (.pfx ou .p12)
            <div className="flex gap-2 mt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pfx,.p12"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <FileKey className="h-4 w-4 mr-2" />
                Selecionar arquivo
              </Button>
              {selectedFile && (
                <Body className="flex items-center">{selectedFile.name}</Body>
              )}
            </div>
          </Label>
        </div>

        <div className="col-span-2">
          <Label>
            Senha do certificado
            <Input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="Digite a senha do certificado"
              disabled={isUploading}
            />
          </Label>
        </div>
      </SettingsCategoryBlock>

      <div className="inline-flex grow bg-white border-1 rounded-xl p-4 sticky bottom-4 left-4 w-full mt-2">
        <Button
          type="button"
          onClick={handleUpload}
          disabled={!selectedFile || !password || isUploading}
        >
          {isUploading ? (
            <>
              <LoadingSpinner className="h-4 w-4 mr-2" />
              Enviando...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Enviar Certificado
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
