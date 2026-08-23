import { afterEach, describe, expect, test } from 'bun:test'
import { getPublicAppBaseUrl } from './domain-config'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('domain config', () => {
  test('prefers explicit public app URL over Vercel generated deployment URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://clicaepedeofc.vercel.app/'
    process.env.VERCEL_URL =
      'clicaepedeofc-fre74tpop-clicaepede-projects.vercel.app'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'clicaepedeofc.vercel.app'

    expect(getPublicAppBaseUrl()).toBe('https://clicaepedeofc.vercel.app')
  })

  test('uses Vercel production URL before generated preview URL', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.APP_URL
    delete process.env.NEXT_PUBLIC_APP_DOMAIN
    process.env.VERCEL_URL =
      'clicaepedeofc-fre74tpop-clicaepede-projects.vercel.app'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'clicaepedeofc.vercel.app'

    expect(getPublicAppBaseUrl()).toBe('https://clicaepedeofc.vercel.app')
  })

  test('keeps localhost fallback for development without configured domains', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.APP_URL
    delete process.env.NEXT_PUBLIC_APP_DOMAIN
    delete process.env.VERCEL_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL

    expect(getPublicAppBaseUrl()).toBe('http://localhost:3000')
  })
})
