import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'

const actionsSource = fs.readFileSync(
  path.join(import.meta.dir, 'actions.ts'),
  'utf8'
)

describe('internal operation actions authorization', () => {
  test('keeps subscription terms changes behind the rollout-gated permission helper', () => {
    expect(actionsSource).toContain('requireAnyInternalPermission')
    expect(actionsSource).toContain("'manage_billing_values'")
    expect(actionsSource).toContain("'apply_billing_discounts'")
    expect(actionsSource).not.toMatch(
      /import\s*\{[^}]*\bgetInternalOperator\b[^}]*\}\s*from\s*['"]@\/features\/internal-operations\/access['"]/
    )
    expect(actionsSource).not.toMatch(
      /import\s*\{[^}]*\bcanUseInternalPermission\b[^}]*\}\s*from\s*['"]@\/features\/internal-operations\/access['"]/
    )
  })
})
