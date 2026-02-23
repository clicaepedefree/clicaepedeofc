import { paymentMethods } from '@/features/order/shared/payment-methods'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { Combobox } from '@/shared/combobox'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { MultiSelect } from '@/shared/multi-select'
import { Body } from '@/shared/typography/body'
import { useState } from 'react'

export const LegalSettings = () => {
  const [environment, setEnvironment] = useState('')
  const [legalCategory, setLegalCategory] = useState('')
  const [paymentMethodsForAutoEmission, setPaymentMethodsForAutoEmission] =
    useState<(typeof paymentMethods)[number]['id'][]>([])
  return (
    <div className="space-y-2">
      <SettingsCategoryBlock title="Cadastro Centralizado de Contribuinte (CCC)">
        <Label>
          Ambiente
          <Combobox
            options={[
              { value: 'test', label: 'Homologação' },
              { value: 'production', label: 'Produção' },
            ]}
            value={environment}
            onChange={setEnvironment}
          />
        </Label>
        <Label>
          Inscrição estadual
          <Input
            type="text"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
        <Label>
          Regime Tributário
          <Combobox
            options={[
              { value: 'isento', label: 'Isento' },
              {
                value: 'microempreendedorIndividual',
                label: 'Microempreendedor Individual (MEI)',
              },
              { value: 'simplesNacional', label: 'Simples Nacional' },
              { value: 'lucroPresumido', label: 'Lucro Presumido' },
              { value: 'lucroReal', label: 'Lucro Real' },
            ]}
            value={legalCategory}
            onChange={setLegalCategory}
          />
        </Label>
      </SettingsCategoryBlock>
      <SettingsCategoryBlock title="Código de Segurança do Contribuinte (CSC)">
        <Label>
          ID
          <Input
            type="text"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
        <Label>
          Código
          <Input
            type="text"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
      </SettingsCategoryBlock>
      <SettingsCategoryBlock title="Exportação">
        <Label>
          <div className="inline-flex items-center justify-center gap-1">
            Email do contador
            <Body highlight="secondary" fontWeight="regular">
              (Opcional)
            </Body>
          </div>
          <Input
            type="text"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
      </SettingsCategoryBlock>
      <SettingsCategoryBlock title="NF-e">
        <Label>
          Série
          <Input
            type="number"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
      </SettingsCategoryBlock>
      <SettingsCategoryBlock title="NFC-e">
        <Label>
          Série
          <Input
            type="text"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
        <Label>
          Emissão automática para
          <MultiSelect
            options={paymentMethods.map(method => ({
              value: method.id,
              label: method.name,
            }))}
            value={paymentMethodsForAutoEmission}
            onValueChange={values =>
              setPaymentMethodsForAutoEmission(
                values as (typeof paymentMethods)[number]['id'][]
              )
            }
            autoSize
            minWidth="500px"
          />
        </Label>
      </SettingsCategoryBlock>
      <div className="inline-flex grow bg-white border-1 rounded-xl p-4 sticky bottom-4 left-4 w-full mt-2">
        <Button>Salvar</Button>
      </div>
    </div>
  )
}
