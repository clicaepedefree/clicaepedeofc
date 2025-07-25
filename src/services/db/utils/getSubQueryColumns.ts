import { ColumnsSelection } from 'drizzle-orm'
import {
  SubqueryWithSelection,
  WithSubqueryWithSelection,
} from 'drizzle-orm/pg-core'

/**
 * Extracts all columns from a Drizzle ORM subquery object
 * 
 * @param subquery - The subquery to extract columns from
 * @returns The columns selection from the subquery
 */
export function getSubQueryColumns<
  TTableName extends string,
  TColumnsSelection extends ColumnsSelection,
>(
  subquery:
    | SubqueryWithSelection<TColumnsSelection, TTableName>
    | WithSubqueryWithSelection<TColumnsSelection, TTableName>
): TColumnsSelection {
  return subquery._.selectedFields as TColumnsSelection
}
