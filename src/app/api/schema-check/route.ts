import { db } from '@/services/db'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Check if ifood_oauth_sessions table exists and get its columns
    const oauthSessionsResult = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ifood_oauth_sessions'
      ORDER BY ordinal_position
    `)

    // Check if ifood_integrations has the new columns
    const integrationsResult = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ifood_integrations'
      ORDER BY ordinal_position
    `)

    // Check foreign key constraint
    const fkResult = await db.execute(sql`
      SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'ifood_oauth_sessions'
    `)

    return NextResponse.json({
      success: true,
      ifood_oauth_sessions: {
        exists: oauthSessionsResult.rows.length > 0,
        columns: oauthSessionsResult.rows,
        foreignKeys: fkResult.rows,
      },
      ifood_integrations: {
        columns: integrationsResult.rows,
        hasCatalogId: integrationsResult.rows.some((r: any) => r.column_name === 'catalog_id'),
        hasCatalogName: integrationsResult.rows.some((r: any) => r.column_name === 'catalog_name'),
        hasMerchantName: integrationsResult.rows.some((r: any) => r.column_name === 'merchant_name'),
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}
