import { db } from '@/services/db'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// Zod schemas for raw SQL result validation
const ColumnInfoSchema = z.object({
  column_name: z.string(),
  data_type: z.string(),
  is_nullable: z.string(),
})

const ForeignKeySchema = z.object({
  constraint_name: z.string(),
  column_name: z.string(),
  foreign_table_name: z.string(),
  foreign_column_name: z.string(),
})

export async function GET() {
  try {
    // Check if ifood_oauth_sessions table exists and get its columns
    // Note: db.execute returns an array directly with postgres-js driver
    const oauthSessionsRaw = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ifood_oauth_sessions'
      ORDER BY ordinal_position
    `)
    const oauthSessionsResult = z.array(ColumnInfoSchema).parse(oauthSessionsRaw)

    // Check if ifood_integrations has the new columns
    const integrationsRaw = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ifood_integrations'
      ORDER BY ordinal_position
    `)
    const integrationsResult = z.array(ColumnInfoSchema).parse(integrationsRaw)

    // Check foreign key constraint
    const fkRaw = await db.execute(sql`
      SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'ifood_oauth_sessions'
    `)
    const fkResult = z.array(ForeignKeySchema).parse(fkRaw)

    return NextResponse.json({
      success: true,
      ifood_oauth_sessions: {
        exists: oauthSessionsResult.length > 0,
        columns: oauthSessionsResult,
        foreignKeys: fkResult,
      },
      ifood_integrations: {
        columns: integrationsResult,
        hasCatalogId: integrationsResult.some((r) => r.column_name === 'catalog_id'),
        hasCatalogName: integrationsResult.some((r) => r.column_name === 'catalog_name'),
        hasMerchantName: integrationsResult.some((r) => r.column_name === 'merchant_name'),
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}
