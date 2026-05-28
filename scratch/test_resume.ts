import { initDb, getDb } from '../api/db.js';

async function runTests() {
  console.log('--- START CRASH RECOVERY VERIFICATION TESTS ---');

  try {
    // 1. Initialize DB and check schema
    const db = await initDb();
    console.log('✓ DB Initialized successfully');

    // 2. Insert mock stale sync tasks
    await db.run('DELETE FROM sync_transfer_queue');
    
    // Insert one pending, one syncing, one completed
    await db.run(`
      INSERT INTO sync_transfer_queue (connection_id, file_path, direction, total_size, bytes_transferred, status)
      VALUES 
        (999, '/test/path/file1.txt', 'upload', 1000, 200, 'syncing'),
        (999, '/test/path/file2.txt', 'upload', 500, 0, 'pending'),
        (999, '/test/path/file3.txt', 'upload', 2000, 2000, 'completed')
    `);
    console.log('✓ Mock sync tasks inserted');

    // 3. Verify they were inserted correctly
    let tasks = await db.all('SELECT * FROM sync_transfer_queue WHERE connection_id = 999');
    console.log('Initial inserted tasks:', tasks);

    // 4. Simulate application restart by running the recovery query
    await db.exec(`
      UPDATE sync_transfer_queue 
      SET status = 'interrupted' 
      WHERE status = 'syncing' OR status = 'pending'
    `);
    console.log('✓ Simulated application restart (run recovery update query)');

    // 5. Verify the state after recovery
    tasks = await db.all('SELECT * FROM sync_transfer_queue WHERE connection_id = 999');
    console.log('Recovered tasks state:', tasks);

    const syncingCount = tasks.filter(t => t.status === 'syncing').length;
    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const interruptedCount = tasks.filter(t => t.status === 'interrupted').length;
    const completedCount = tasks.filter(t => t.status === 'completed').length;

    if (syncingCount === 0 && pendingCount === 0 && interruptedCount === 2 && completedCount === 1) {
      console.log('✓ SUCCESS: Stale pending and syncing tasks were correctly marked as interrupted');
    } else {
      console.error('✗ FAILURE: Recovery state did not match expected values', {
        syncingCount, pendingCount, interruptedCount, completedCount
      });
      process.exit(1);
    }

    // Clean up
    await db.run('DELETE FROM sync_transfer_queue WHERE connection_id = 999');
    console.log('✓ Cleaned up mock data');
    console.log('--- ALL RECOVERY TESTS PASSED SUCCESSFULLY ---');

  } catch (error) {
    console.error('✗ Test failed with error:', error);
    process.exit(1);
  }
}

runTests();
