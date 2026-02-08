import type { IFoodMenuItem } from '@/services/ifood/types'
import type { ItemMatch, LocalMenuItem, SuggestedMatch } from './types'

/**
 * Auto-match iFood items with local items by externalCode only
 * Conservative strategy to avoid incorrect matches
 */
export function autoMatchItems(
  localItems: LocalMenuItem[],
  ifoodItems: IFoodMenuItem[]
): { matches: ItemMatch[]; unmatched: IFoodMenuItem[] } {
  const matches: ItemMatch[] = []
  const matched = new Set<string>()

  // Strategy: Match ONLY by externalCode (PDV code)
  // Skip EAN matching - iFood may have multiple items with same EAN
  for (const ifoodItem of ifoodItems) {
    // Only auto-match if iFood item has an externalCode
    if (!ifoodItem.externalCode) {
      continue
    }

    // Find local item with matching externalCode
    const localItem = localItems.find(
      local => local.externalCode === ifoodItem.externalCode
    )

    if (localItem) {
      matches.push({
        ifoodItemId: ifoodItem.id,
        localItemOfferingId: localItem.id,
        pdvCode: localItem.externalCode!,
        matchSource: 'auto_code',
      })
      matched.add(ifoodItem.id)
    }
  }

  // Collect unmatched items
  const unmatched = ifoodItems.filter(item => !matched.has(item.id))

  return { matches, unmatched }
}

/**
 * Find suggested matches for a single iFood item
 * Uses name similarity as hints for manual selection
 */
export function findSuggestedMatches(
  ifoodItem: IFoodMenuItem,
  localItems: LocalMenuItem[],
  limit = 3
): SuggestedMatch[] {
  const suggestions: SuggestedMatch[] = []

  // Strategy: Match by name similarity
  const nameMatches = localItems
    .map(local => ({
      item: local,
      similarity: stringSimilarity(
        ifoodItem.name.toLowerCase(),
        local.name.toLowerCase()
      ),
    }))
    .filter(match => match.similarity > 0.6) // Only >60% similarity
    .sort((a, b) => b.similarity - a.similarity) // Sort by similarity desc
    .slice(0, limit)

  for (const match of nameMatches) {
    suggestions.push({
      item: match.item,
      matchType: 'name',
      confidence: match.similarity,
    })
  }

  return suggestions.slice(0, limit)
}

/**
 * Calculate string similarity using simple word-based matching
 * Returns a score between 0 and 1
 */
function stringSimilarity(str1: string, str2: string): number {
  // Normalize strings: lowercase, remove accents, split into words
  const normalize = (str: string) =>
    str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2) // Ignore very short words

  const words1 = normalize(str1)
  const words2 = normalize(str2)

  if (words1.length === 0 || words2.length === 0) {
    return 0
  }

  // Count matching words (both exact and partial matches)
  let matches = 0

  for (const word1 of words1) {
    for (const word2 of words2) {
      // Exact match
      if (word1 === word2) {
        matches += 1
        break
      }
      // Partial match (one word contains the other)
      if (word1.includes(word2) || word2.includes(word1)) {
        matches += 0.5
        break
      }
    }
  }

  // Calculate similarity as ratio of matches to total unique words
  const totalWords = Math.max(words1.length, words2.length)
  return matches / totalWords
}

/**
 * Validate PDV code format (optional - implement if needed)
 */
export function validatePDVCode(code: string): boolean {
  // Add validation rules if PDV codes have specific format
  // For now, just check if not empty
  return code.trim().length > 0
}
