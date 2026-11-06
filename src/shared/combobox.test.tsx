import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Combobox } from './combobox'

const longName = 'QA160 Loja de Testes Nome Longo para Validacao'
const options = [
  { value: '1', label: longName },
  { value: '2', label: 'QA160' },
]

describe('Combobox bounded label', () => {
  test('opt-in contains long text without replacing its accessible name', () => {
    const html = renderToStaticMarkup(
      <Combobox options={options} value="1" onChange={() => {}} truncateLabel />
    )
    expect(html).toContain('role="combobox"')
    expect(html).toContain('min-w-0 flex-1 truncate text-left')
    expect(html).toContain(`title="${longName}"`)
    expect(html).toContain(`>${longName}</span>`)
    expect(html).toContain('shrink-0')
  })

  test('short label and placeholder remain available in constrained triggers', () => {
    const short = renderToStaticMarkup(
      <Combobox options={options} value="2" onChange={() => {}} truncateLabel />
    )
    const empty = renderToStaticMarkup(
      <Combobox
        options={options}
        onChange={() => {}}
        placeholder="Selecionar loja"
        truncateLabel
      />
    )
    expect(short).toContain('title="QA160"')
    expect(empty).toContain('title="Selecionar loja"')
    expect(empty).toContain('>Selecionar loja</span>')
  })

  test('other combobox consumers preserve their existing label rendering', () => {
    const html = renderToStaticMarkup(
      <Combobox options={options} value="1" onChange={() => {}} />
    )
    expect(html).toContain(longName)
    expect(html).not.toContain('min-w-0 flex-1 truncate text-left')
    expect(html).not.toContain(`title="${longName}"`)
  })
})
