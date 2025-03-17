import { db } from '@/services/db'
import { usersTable } from '@/services/db/schema'

export async function GET() {
  const allUsers = await db.select().from(usersTable)
  console.log('allUsers', allUsers)
  return Response.json({ message: allUsers })
}
