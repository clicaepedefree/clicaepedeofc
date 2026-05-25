'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { Combobox } from '@/shared/combobox'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { dispatchToast } from '@/shared/lib/toast'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { useForm } from '@tanstack/react-form'
import { useAtom } from 'jotai'
import { saveFiscalSettings } from '../api'
import { fiscalSettingsFormSchema, type FiscalSettingsFormValues } from '../form-validation/fiscal-schemas'
import { useFiscalConfig } from '../hooks/use-fiscal-config'

const environmentOptions = [
  { value: 'sandbox', label: 'Homologação (Testes)' },
  { value: 'production', label: 'Produção' },
]

const defaultValues: FiscalSettingsFormValues = {
  nfeioApiKey: '',
  environment: 'sandbox',
  stateRegistration: '',
  municipalRegistration: '',
  cscId: '',
  cscCode: '',
  nfceSeries: 1,
  nextNfceNumber: 1,
  accountantEmail: '',
}

export const FiscalSettingsForm = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { data: fiscalConfig, isLoading, invalidate } = useFiscalConfig(selectedStoreId)

  const initialValues: FiscalSettingsFormValues = fiscalConfig
    ? {
        nfeioApiKey: fiscalConfig.nfeioApiKey ?? '',
        environment: fiscalConfig.environment,
        stateRegistration: fiscalConfig.stateRegistration ?? '',
        municipalRegistration: fiscalConfig.municipalRegistration ?? '',
        cscId: fiscalConfig.cscId ?? '',
        cscCode: fiscalConfig.cscCode ?? '',
        nfceSeries: fiscalConfig.nfceSeries,
        nextNfceNumber: fiscalConfig.nextNfceNumber,
        accountantEmail: fiscalConfig.accountantEmail ?? '',
      }
    : defaultValues

  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onChange: fiscalSettingsFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) return

      try {
        await saveFiscalSettings(selectedStoreId, value)
        invalidate()
        dispatchToast({ message: 'Configurações fiscais salvas com sucesso!', type: 'success' })
      } catch (error) {
        dispatchToast({
          message: error instanceof Error ? error.message : 'Erro ao salvar configurações',
          type: 'error',
        })
      }
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        event.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="space-y-2">
        <SettingsCategoryBlock title="Credenciais NFe.io">
          <form.Field name="nfeioApiKey">
            {field => (
              <Label className="col-span-2">
                Chave de API (API Key)
                <Input
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                  placeholder={fiscalConfig?.nfeioApiKey ? '••••••••' : 'Cole sua chave de API aqui'}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="environment">
            {field => (
              <Label className="col-span-2">
                Ambiente
                <Combobox
                  options={environmentOptions}
                  value={field.state.value}
                  onChange={value => field.handleChange(value as 'sandbox' | 'production')}
                />
              </Label>
            )}
          </form.Field>
        </SettingsCategoryBlock>

        <SettingsCategoryBlock title="Inscrições">
          <form.Field name="stateRegistration">
            {field => (
              <Label className="col-span-2">
                <div className="inline-flex items-center gap-1">
                  Inscrição Estadual (IE)
                  <Body highlight="secondary" fontWeight="regular">
                    (Opcional)
                  </Body>
                </div>
                <Input
                  type="text"
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="municipalRegistration">
            {field => (
              <Label className="col-span-2">
                <div className="inline-flex items-center gap-1">
                  Inscrição Municipal (IM)
                  <Body highlight="secondary" fontWeight="regular">
                    (Opcional)
                  </Body>
                </div>
                <Input
                  type="text"
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
        </SettingsCategoryBlock>

        <SettingsCategoryBlock title="Código de Segurança do Contribuinte (CSC)">
          <form.Field name="cscId">
            {field => (
              <Label className="col-span-2">
                <div className="inline-flex items-center gap-1">
                  ID do CSC
                  <Body highlight="secondary" fontWeight="regular">
                    (Opcional)
                  </Body>
                </div>
                <Input
                  type="text"
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="cscCode">
            {field => (
              <Label className="col-span-2">
                <div className="inline-flex items-center gap-1">
                  Código CSC
                  <Body highlight="secondary" fontWeight="regular">
                    (Opcional)
                  </Body>
                </div>
                <Input
                  type="text"
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
        </SettingsCategoryBlock>

        <SettingsCategoryBlock title="NFC-e">
          <form.Field name="nfceSeries">
            {field => (
              <Label className="col-span-2">
                Série
                <Input
                  type="number"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(parseInt(event.target.value) || 1)}
                  error={field.state.meta.errors[0]?.message}
                  min={1}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="nextNfceNumber">
            {field => (
              <Label className="col-span-2">
                Próximo número
                <Input
                  type="number"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(parseInt(event.target.value) || 1)}
                  error={field.state.meta.errors[0]?.message}
                  min={1}
                />
              </Label>
            )}
          </form.Field>
        </SettingsCategoryBlock>

        <SettingsCategoryBlock title="Exportação">
          <form.Field name="accountantEmail">
            {field => (
              <Label className="col-span-2">
                <div className="inline-flex items-center gap-1">
                  Email do contador
                  <Body highlight="secondary" fontWeight="regular">
                    (Opcional)
                  </Body>
                </div>
                <Input
                  type="email"
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
        </SettingsCategoryBlock>

        <div className="inline-flex grow bg-card border rounded-xl p-4 sticky bottom-4 left-4 w-full mt-2 shadow-lg shadow-slate-950/5 dark:shadow-black/25">
          <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </form>
  )
}
