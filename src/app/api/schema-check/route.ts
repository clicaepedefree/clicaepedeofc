import { db } from '@/services/db'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Check if ifood_oauth_sessions table exists and get its columns
    // Note: db.execute returns an array directly with postgres-js driver
    const oauthSessionsResult = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ifood_oauth_sessions'
      ORDER BY ordinal_position
    `) as unknown as Array<{ column_name: string; data_type: string; is_nullable: string }>

    // Check if ifood_integrations has the new columns
    const integrationsResult = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ifood_integrations'
      ORDER BY ordinal_position
    `) as unknown as Array<{ column_name: string; data_type: string; is_nullable: string }>

    // Check foreign key constraint
    const fkResult = await db.execute(sql`
      SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'ifood_oauth_sessions'
    `) as unknown as Array<{ constraint_name: string; column_name: string; foreign_table_name: string; foreign_column_name: string }>

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
