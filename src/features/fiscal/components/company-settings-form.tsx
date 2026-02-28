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
import { saveCompanyInfo, createNfeioCompany } from '../api'
import { companyFormSchema, type CompanyFormValues } from '../form-validation/fiscal-schemas'
import { useFiscalConfig } from '../hooks/use-fiscal-config'

const taxRegimeOptions = [
  { value: 'simplesNacional', label: 'Simples Nacional' },
  { value: 'simplesNacionalExcessoSublimite', label: 'Simples Nacional - Excesso Sublimite' },
  { value: 'regimeNormal', label: 'Lucro Presumido/Real' },
  { value: 'mei', label: 'MEI' },
]

const brazilianStates = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
].map(uf => ({ value: uf, label: uf }))

const defaultValues: CompanyFormValues = {
  federalTaxNumber: '',
  name: '',
  tradeName: '',
  taxRegime: null,
  email: '',
  phone: '',
  addressStreet: '',
  addressNumber: '',
  addressComplement: '',
  addressNeighborhood: '',
  addressCity: '',
  addressState: '',
  addressPostalCode: '',
  addressCityCode: '',
}

export const CompanySettingsForm = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { data: fiscalConfig, isLoading, invalidate } = useFiscalConfig(selectedStoreId)

  const initialValues: CompanyFormValues = fiscalConfig
    ? {
        federalTaxNumber: fiscalConfig.federalTaxNumber ?? '',
        name: fiscalConfig.name ?? '',
        tradeName: fiscalConfig.tradeName ?? '',
        taxRegime: fiscalConfig.taxRegime,
        email: fiscalConfig.email ?? '',
        phone: fiscalConfig.phone ?? '',
        addressStreet: fiscalConfig.addressStreet ?? '',
        addressNumber: fiscalConfig.addressNumber ?? '',
        addressComplement: fiscalConfig.addressComplement ?? '',
        addressNeighborhood: fiscalConfig.addressNeighborhood ?? '',
        addressCity: fiscalConfig.addressCity ?? '',
        addressState: fiscalConfig.addressState ?? '',
        addressPostalCode: fiscalConfig.addressPostalCode ?? '',
        addressCityCode: fiscalConfig.addressCityCode ?? '',
      }
    : defaultValues

  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onChange: companyFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (!selectedStoreId) return

      try {
        await saveCompanyInfo(selectedStoreId, value)
        invalidate()
        dispatchToast({ message: 'Dados da empresa salvos com sucesso!', type: 'success' })
      } catch (error) {
        dispatchToast({
          message: error instanceof Error ? error.message : 'Erro ao salvar dados',
          type: 'error',
        })
      }
    },
  })

  const handleCreateNfeioCompany = async () => {
    if (!selectedStoreId) return

    try {
      await createNfeioCompany(selectedStoreId)
      invalidate()
      dispatchToast({ message: 'Empresa cadastrada no NFe.io com sucesso!', type: 'success' })
    } catch (error) {
      dispatchToast({
        message: error instanceof Error ? error.message : 'Erro ao cadastrar empresa',
        type: 'error',
      })
    }
  }

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
        <SettingsCategoryBlock title="Dados da empresa">
          <form.Field name="federalTaxNumber">
            {field => (
              <Label>
                CNPJ
                <Input
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="name">
            {field => (
              <Label>
                Razão Social
                <Input
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="tradeName">
            {field => (
              <Label>
                <div className="inline-flex items-center gap-1">
                  Nome Fantasia
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
          <form.Field name="taxRegime">
            {field => (
              <Label>
                Regime Tributário
                <Combobox
                  options={taxRegimeOptions}
                  value={field.state.value ?? ''}
                  onChange={value => field.handleChange(value as CompanyFormValues['taxRegime'])}
                />
              </Label>
            )}
          </form.Field>
        </SettingsCategoryBlock>

        <SettingsCategoryBlock title="Contato">
          <form.Field name="email">
            {field => (
              <Label>
                Email
                <Input
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="phone">
            {field => (
              <Label>
                <div className="inline-flex items-center gap-1">
                  Telefone
                  <Body highlight="secondary" fontWeight="regular">
                    (Opcional)
                  </Body>
                </div>
                <Input
                  type="tel"
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
        </SettingsCategoryBlock>

        <SettingsCategoryBlock title="Endereço">
          <form.Field name="addressPostalCode">
            {field => (
              <Label>
                CEP
                <Input
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="addressStreet">
            {field => (
              <Label className="col-span-2">
                Logradouro
                <Input
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="addressNumber">
            {field => (
              <Label>
                Número
                <Input
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="addressComplement">
            {field => (
              <Label>
                <div className="inline-flex items-center gap-1">
                  Complemento
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
          <form.Field name="addressNeighborhood">
            {field => (
              <Label>
                Bairro
                <Input
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="addressCity">
            {field => (
              <Label>
                Cidade
                <Input
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="addressState">
            {field => (
              <Label>
                UF
                <Combobox
                  options={brazilianStates}
                  value={field.state.value}
                  onChange={value => field.handleChange(value)}
                />
              </Label>
            )}
          </form.Field>
          <form.Field name="addressCityCode">
            {field => (
              <Label>
                Código IBGE
                <Input
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={event => field.handleChange(event.target.value)}
                  error={field.state.meta.errors[0]?.message}
                />
              </Label>
            )}
          </form.Field>
        </SettingsCategoryBlock>

        <div className="inline-flex grow bg-white border-1 rounded-xl p-4 sticky bottom-4 left-4 w-full mt-2 gap-2">
          <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
            )}
          </form.Subscribe>
          {fiscalConfig && !fiscalConfig.nfeioCompanyId && (
            <Button type="button" variant="secondary" onClick={handleCreateNfeioCompany}>
              Cadastrar no NFe.io
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
