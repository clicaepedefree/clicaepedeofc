import { db } from '@/services/db'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Check if ifood_oauth_sessions table already exists
    const checkTable = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'ifood_oauth_sessions'
      )
    `) as unknown as Array<{ exists: boolean }>

    if (checkTable[0]?.exists) {
      return NextResponse.json({
        success: true,
        message: 'Migration already applied - ifood_oauth_sessions table exists',
      })
    }

    // Create ifood_oauth_sessions table
    await db.execute(sql`
      CREATE TABLE "ifood_oauth_sessions" (
        "id" serial PRIMARY KEY NOT NULL,
        "store_id" integer NOT NULL,
        "user_code" text NOT NULL,
        "authorization_code_verifier" text NOT NULL,
        "access_token" text,
        "refresh_token" text,
        "expires_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `)

    // Add catalog_id column to ifood_integrations if not exists
    const checkCatalogId = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'ifood_integrations' AND column_name = 'catalog_id'
      )
    `) as unknown as Array<{ exists: boolean }>

    if (!checkCatalogId[0]?.exists) {
      await db.execute(sql`ALTER TABLE "ifood_integrations" ADD COLUMN "catalog_id" text`)
    }

    // Add catalog_name column to ifood_integrations if not exists
    const checkCatalogName = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'ifood_integrations' AND column_name = 'catalog_name'
      )
    `) as unknown as Array<{ exists: boolean }>

    if (!checkCatalogName[0]?.exists) {
      await db.execute(sql`ALTER TABLE "ifood_integrations" ADD COLUMN "catalog_name" text`)
    }

    // Add merchant_name column to ifood_integrations if not exists
    const checkMerchantName = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'ifood_integrations' AND column_name = 'merchant_name'
      )
    `) as unknown as Array<{ exists: boolean }>

    if (!checkMerchantName[0]?.exists) {
      await db.execute(sql`ALTER TABLE "ifood_integrations" ADD COLUMN "merchant_name" text`)
    }

    // Add foreign key constraint
    await db.execute(sql`
      ALTER TABLE "ifood_oauth_sessions"
      ADD CONSTRAINT "ifood_oauth_sessions_store_id_stores_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
      ON DELETE cascade ON UPDATE no action
    `)

    return NextResponse.json({
      success: true,
      message: 'Migration applied successfully',
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 })
  }
}
