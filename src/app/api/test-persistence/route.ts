import { db } from '@/services/db'
import { configurationsTable } from '@/services/db/schema/configurations'
import { eq, like } from 'drizzle-orm'

// POST - Create a test record with unique identifier
export async function POST(request: Request) {
  try {
    const { testId } = await request.json()

    if (!testId) {
      return Response.json(
        { error: 'testId is required' },
        { status: 400 }
      )
    }

    // Create a test configuration record
    const result = await db
      .insert(configurationsTable)
      .values({
        category: 'PERSISTENCE_TEST',
        name: testId,
        default: 'test_value',
        type: 'test',
      })
      .returning()

    return Response.json({
      success: true,
      message: 'Test record created successfully',
      data: result[0],
    })
  } catch (error) {
    console.error('Error creating test record:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// GET - Retrieve test records by testId
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const testId = url.searchParams.get('testId')

    if (testId) {
      // Get specific test record
      const records = await db
        .select()
        .from(configurationsTable)
        .where(eq(configurationsTable.name, testId))

      return Response.json({
        success: true,
        exists: records.length > 0,
        data: records,
      })
    } else {
      // Get all PERSISTENCE_TEST records
      const records = await db
        .select()
        .from(configurationsTable)
        .where(eq(configurationsTable.category, 'PERSISTENCE_TEST'))

      return Response.json({
        success: true,
        count: records.length,
        data: records,
      })
    }
  } catch (error) {
    console.error('Error retrieving test records:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// DELETE - Remove test records
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const testId = url.searchParams.get('testId')

    if (testId) {
      // Delete specific test record
      const result = await db
        .delete(configurationsTable)
        .where(eq(configurationsTable.name, testId))
        .returning()

      return Response.json({
        success: true,
        message: `Deleted ${result.length} record(s)`,
        deleted: result,
      })
    } else {
      // Delete all PERSISTENCE_TEST records (cleanup)
      const result = await db
        .delete(configurationsTable)
        .where(eq(configurationsTable.category, 'PERSISTENCE_TEST'))
        .returning()

      return Response.json({
        success: true,
        message: `Deleted ${result.length} PERSISTENCE_TEST record(s)`,
        deleted: result,
      })
    }
  } catch (error) {
    console.error('Error deleting test records:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
