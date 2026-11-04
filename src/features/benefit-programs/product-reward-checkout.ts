import 'server-only'
import { and, asc, eq, or, isNull, gte, sql } from 'drizzle-orm'
import type { DbTransaction } from '@/services/db/types'
import {
  categoriesTable,
  itemsTable,
  itemOfferingsTable,
  itemOfferingOptionGroupsTable,
  optionGroupsTable,
} from '@/services/db/schema'

/** A prize is one base product, never an implicit choice of paid/required options. */
export async function getProductRewardCheckoutItem(
  storeId: number,
  itemId: number,
  index: number,
  tx: DbTransaction
) {
  const [item] = await tx
    .select({
      itemOfferingId: itemOfferingsTable.id,
      itemId: itemsTable.id,
      categoryId: categoriesTable.id,
      itemName: itemsTable.name,
      categoryName: categoriesTable.name,
      originalPrice: itemOfferingsTable.price,
      externalCode: itemOfferingsTable.externalCode,
      ean: itemsTable.ean,
    })
    .from(itemOfferingsTable)
    .innerJoin(itemsTable, eq(itemsTable.id, itemOfferingsTable.itemId))
    .innerJoin(
      categoriesTable,
      eq(categoriesTable.id, itemOfferingsTable.categoryId)
    )
    .where(
      and(
        eq(itemsTable.id, itemId),
        eq(itemsTable.storeId, storeId),
        eq(categoriesTable.storeId, storeId),
        eq(itemOfferingsTable.isAvailable, true),
        eq(categoriesTable.isAvailable, true),
        or(isNull(itemsTable.inventory), gte(itemsTable.inventory, 1)),
        sql`not exists (select 1 from ${itemOfferingOptionGroupsTable} as reward_link
        join ${optionGroupsTable} as reward_group on reward_group.id=reward_link.option_group_id
        where reward_link.item_offering_id=${itemOfferingsTable.id} and (reward_group.min_quantity <> 0 or reward_group.store_id <> ${storeId}))`
      )
    )
    .orderBy(asc(itemOfferingsTable.id))
    .limit(1)
    .for('update')
  if (!item) throw new Error('PRODUCT_REWARD_UNAVAILABLE')
  return {
    ...item,
    index,
    price: '0.0000',
    quantity: 1,
    comment: 'Premio de fidelidade',
    options: [],
  }
}
