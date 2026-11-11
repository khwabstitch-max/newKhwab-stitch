// Mongoose's readyState may report disconnected after a serverless freeze
// because its last heartbeat is old. Verify the existing native connection
// without opening another pool or replaying a business operation.
export async function databaseReady(connection) {
  try {
    if (!connection?.db) return false;
    const result = await connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
    return result?.ok === 1;
  } catch {
    return false;
  }
}
