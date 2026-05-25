import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { Body } from '@/shared/typography/body'

export const CompanySettings = () => {
  return (
    <div className="space-y-2">
      <SettingsCategoryBlock title="Dados da empresa">
        <Label>
          <div className="inline-flex items-center justify-center gap-1">
            CNPJ{' '}
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
        <Label>
          <div className="inline-flex items-center justify-center gap-1">
            Empresa
            <Body highlight="secondary" fontWeight="regular">
              (Nome fantasia)
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
        <Label>
          Telefone 1
          <Input
            type="tel"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
        <Label>
          <div className="inline-flex items-center justify-center gap-1">
            Telefone 2{' '}
            <Body highlight="secondary" fontWeight="regular">
              (Opcional)
            </Body>
          </div>
          <Input
            type="tel"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
        <Label>
          E-mail
          <Input
            type="email"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
      </SettingsCategoryBlock>
      <SettingsCategoryBlock title="Responsável pela empresa">
        <Label>
          Nome
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
          CPF
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
          Telefone
          <Input
            type="tel"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
        <Label>
          Email
          <Input
            type="email"
            value={''}
            onBlur={() => {}}
            onChange={e => {}}
            required
            error={''}
          />
        </Label>
      </SettingsCategoryBlock>
      <SettingsCategoryBlock title="Endereço">
        <Label>
          CEP
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
          Endereço
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
          Número
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
          Bairro
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
          Cidade
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
          UF
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
      <div className="inline-flex grow bg-card border rounded-xl p-4 sticky bottom-4 left-4 w-full mt-2 shadow-lg shadow-slate-950/5 dark:shadow-black/25">
        <Button>Salvar</Button>
      </div>
    </div>
  )
}
