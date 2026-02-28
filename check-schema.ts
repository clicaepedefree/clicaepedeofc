import { db } from './src/services/db'
import { sql } from 'drizzle-orm'

async function checkSchema() {
  try {
    // Check if ifood_oauth_sessions table exists
    const oauthSessionsResult = await db.execute(sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'ifood_oauth_sessions'
      ORDER BY ordinal_position
    `)
    console.log('\n=== ifood_oauth_sessions table columns ===')
    console.log(JSON.stringify(oauthSessionsResult.rows, null, 2))

    // Check if ifood_integrations has the new columns
    const integrationsResult = await db.execute(sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'ifood_integrations'
      ORDER BY ordinal_position
    `)
    console.log('\n=== ifood_integrations table columns ===')
    console.log(JSON.stringify(integrationsResult.rows, null, 2))

    // Check foreign key constraint
    const fkResult = await db.execute(sql`
      SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'ifood_oauth_sessions'
    `)
    console.log('\n=== ifood_oauth_sessions foreign keys ===')
    console.log(JSON.stringify(fkResult.rows, null, 2))

    console.log('\n✅ Schema verification complete\!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error checking schema:', error)
    process.exit(1)
  }
}

checkSchema()
