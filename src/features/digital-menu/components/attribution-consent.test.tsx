import { describe, expect, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from '@/shared/button'
import { AttributionConsent } from './attribution-consent'

describe('public attribution consent without storage or network', () => {
  test('SSR is nonmodal, with concise copy and two explicit choices', () => {
    let calls = 0
    const html = renderToStaticMarkup(
      createElement(AttributionConsent, {
        onAccept: () => calls++,
        onDecline: () => calls++,
      })
    )
    for (const text of [
      'Compartilhar a origem desta visita com a loja?',
      'Sem telefone, IP ou rastreamento entre sites.',
      'Permitir',
      'Agora nao',
      'aria-label="Consentimento de origem da visita"',
    ])
      expect(html.includes(text)).toBe(true)
    expect((html.match(/<button /g) ?? []).length).toBe(2)
    expect((html.match(/type="button"/g) ?? []).length).toBe(2)
    expect(html.includes('dialog')).toBe(false)
    expect(html.includes('fixed')).toBe(false)
    expect(html.includes('data-slot="card"')).toBe(false)
    expect(calls).toBe(0)
  })

  test('busy disables both choices; ordinary callbacks are passed to the buttons', () => {
    let accepted = 0
    let declined = 0
    const props = {
      onAccept: () => accepted++,
      onDecline: () => declined++,
    }
    const tree = AttributionConsent(props)
    const actions = tree.props.children[1] as ReactElement<{
      children: ReactElement<{ onClick: () => void; disabled: boolean }>[]
    }>
    const [accept, decline] = actions.props.children
    expect(accept.type).toBe(Button)
    expect(decline.type).toBe(Button)
    expect(accept.props.disabled).toBe(false)
    accept.props.onClick()
    decline.props.onClick()
    expect(accepted).toBe(1)
    expect(declined).toBe(1)
    const html = renderToStaticMarkup(
      createElement(AttributionConsent, { ...props, busy: true })
    )
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2)
    expect(html.includes('aria-busy="true"')).toBe(true)
    expect(accepted).toBe(1)
    expect(declined).toBe(1)
  })

  test('parent controls visibility without mounting consent or invoking callbacks', () => {
    const html = renderToStaticMarkup(
      createElement(
        'main',
        null,
        false &&
          createElement(AttributionConsent, {
            onAccept: () => {
              throw new Error('unexpected accept')
            },
            onDecline: () => {
              throw new Error('unexpected decline')
            },
          })
      )
    )
    expect(html).toBe('<main></main>')
  })
})
