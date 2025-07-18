'use server'
import { TestTemplate, TestTemplateInput } from './templates/test'

export const generateTestTemplate = async (data: TestTemplateInput) => {
  return TestTemplate.render(data)
}
