'use client'

import {
  getStoreCompanyProfile,
  saveStoreCompanyProfile,
  type StoreCompanyProfileInput,
} from '@/features/legal-entity/api'
import { selectedStoreIdAtom } from '@/features/store/state'
import { SettingsCategoryBlock } from '@/shared/blocks/settings-category-block'
import { Button } from '@/shared/button'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { dispatchToast } from '@/shared/lib/toast'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import { FormEvent, useEffect, useState } from 'react'

type CompanyProfileField = keyof StoreCompanyProfileInput

const emptyProfile: StoreCompanyProfileInput = {
  companyTaxNumber: '',
  companyName: '',
  phone1: '',
  phone2: '',
  email: '',
  responsibleName: '',
  responsibleTaxNumber: '',
  responsiblePhone: '',
  responsibleEmail: '',
  postalCode: '',
  street: '',
  number: '',
  district: '',
  city: '',
  stateCode: '',
}

const normalizeProfile = (
  profile: StoreCompanyProfileInput
): StoreCompanyProfileInput => {
  return Object.fromEntries(
    Object.entries(profile).map(([key, value]) => [
      key,
      typeof value === 'string' && value.trim() ? value.trim() : null,
    ])
  ) as StoreCompanyProfileInput
}

const companyProfileCacheKey = (storeId: number | null) => [
  'stores',
  storeId,
  'company-profile',
]

const toFormProfile = (
  profile: StoreCompanyProfileInput | null
): StoreCompanyProfileInput => ({
  companyTaxNumber: profile?.companyTaxNumber ?? '',
  companyName: profile?.companyName ?? '',
  phone1: profile?.phone1 ?? '',
  phone2: profile?.phone2 ?? '',
  email: profile?.email ?? '',
  responsibleName: profile?.responsibleName ?? '',
  responsibleTaxNumber: profile?.responsibleTaxNumber ?? '',
  responsiblePhone: profile?.responsiblePhone ?? '',
  responsibleEmail: profile?.responsibleEmail ?? '',
  postalCode: profile?.postalCode ?? '',
  street: profile?.street ?? '',
  number: profile?.number ?? '',
  district: profile?.district ?? '',
  city: profile?.city ?? '',
  stateCode: profile?.stateCode ?? '',
})

export const CompanySettings = () => {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const queryClient = useQueryClient()
  const [profile, setProfile] =
    useState<StoreCompanyProfileInput>(emptyProfile)

  const queryKey = companyProfileCacheKey(selectedStoreId)
  const { data, isLoading } = useQuery({
    enabled: !!selectedStoreId,
    queryKey,
    queryFn: () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return getStoreCompanyProfile(selectedStoreId)
    },
  })

  useEffect(() => {
    if (data === undefined) return
    setProfile(toFormProfile(data))
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (values: StoreCompanyProfileInput) => {
      if (!selectedStoreId) throw new Error('No store selected')
      return saveStoreCompanyProfile(selectedStoreId, normalizeProfile(values))
    },
    onSuccess: savedProfile => {
      queryClient.setQueryData(queryKey, savedProfile)
      dispatchToast({
        type: 'success',
        message: 'Dados da empresa salvos.',
      })
    },
    onError: () => {
      dispatchToast({
        type: 'error',
        message: 'Nao foi possivel salvar os dados da empresa.',
      })
    },
  })

  const updateField = (field: CompanyProfileField, value: string) => {
    setProfile(current => ({ ...current, [field]: value }))
  }

  const inputProps = (field: CompanyProfileField) => ({
    value: profile[field] ?? '',
    onInput: (event: FormEvent<HTMLInputElement>) =>
      updateField(field, event.currentTarget.value),
    onChange: (event: FormEvent<HTMLInputElement>) =>
      updateField(field, event.currentTarget.value),
    error: '',
  })

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveMutation.mutate(profile)
  }

  if (!selectedStoreId) {
    return (
      <SettingsCategoryBlock title="Dados da empresa" contentClassName="grid-cols-1">
        <p className="text-sm text-muted-foreground">
          Selecione uma loja para configurar os dados da empresa.
        </p>
      </SettingsCategoryBlock>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <form onSubmit={submitProfile} className="space-y-2">
      <SettingsCategoryBlock title="Dados da empresa">
        <Label>
          <div className="inline-flex items-center justify-center gap-1">
            CNPJ
            <Body highlight="secondary" fontWeight="regular">
              (Opcional)
            </Body>
          </div>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="organization-tax-id"
            name="companyTaxNumber"
            {...inputProps('companyTaxNumber')}
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
            autoComplete="organization"
            name="companyName"
            {...inputProps('companyName')}
          />
        </Label>
        <Label>
          Telefone 1
          <Input
            type="tel"
            autoComplete="tel"
            name="companyPhone1"
            {...inputProps('phone1')}
          />
        </Label>
        <Label>
          <div className="inline-flex items-center justify-center gap-1">
            Telefone 2
            <Body highlight="secondary" fontWeight="regular">
              (Opcional)
            </Body>
          </div>
          <Input
            type="tel"
            autoComplete="tel"
            name="companyPhone2"
            {...inputProps('phone2')}
          />
        </Label>
        <Label>
          E-mail
          <Input
            type="email"
            autoComplete="email"
            name="companyEmail"
            {...inputProps('email')}
          />
        </Label>
      </SettingsCategoryBlock>

      <SettingsCategoryBlock title="Responsavel pela empresa">
        <Label>
          Nome
          <Input
            type="text"
            autoComplete="name"
            name="responsibleName"
            {...inputProps('responsibleName')}
          />
        </Label>
        <Label>
          CPF
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            name="responsibleTaxNumber"
            {...inputProps('responsibleTaxNumber')}
          />
        </Label>
        <Label>
          Telefone
          <Input
            type="tel"
            autoComplete="tel"
            name="responsiblePhone"
            {...inputProps('responsiblePhone')}
          />
        </Label>
        <Label>
          Email
          <Input
            type="email"
            autoComplete="email"
            name="responsibleEmail"
            {...inputProps('responsibleEmail')}
          />
        </Label>
      </SettingsCategoryBlock>

      <SettingsCategoryBlock title="Endereco">
        <Label>
          CEP
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            name="postalCode"
            {...inputProps('postalCode')}
          />
        </Label>
        <Label>
          Endereco
          <Input
            type="text"
            autoComplete="address-line1"
            name="street"
            {...inputProps('street')}
          />
        </Label>
        <Label>
          Numero
          <Input
            type="text"
            autoComplete="address-line2"
            name="number"
            {...inputProps('number')}
          />
        </Label>
        <Label>
          Bairro
          <Input
            type="text"
            autoComplete="address-level3"
            name="district"
            {...inputProps('district')}
          />
        </Label>
        <Label>
          Cidade
          <Input
            type="text"
            autoComplete="address-level2"
            name="city"
            {...inputProps('city')}
          />
        </Label>
        <Label>
          UF
          <Input
            type="text"
            autoComplete="address-level1"
            name="stateCode"
            maxLength={2}
            {...inputProps('stateCode')}
          />
        </Label>
      </SettingsCategoryBlock>

      <div className="inline-flex w-full grow rounded-xl border bg-card p-4 shadow-lg shadow-slate-950/5 dark:shadow-black/25">
        <Button type="submit" isLoading={saveMutation.isPending}>
          Salvar
        </Button>
      </div>
    </form>
  )
}
