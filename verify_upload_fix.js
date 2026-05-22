/**
 * verify_upload_fix.js
 * Run AFTER applying supabase/fix_upload_and_auth.sql in the Supabase Dashboard.
 * Tests:
 *   1. Bucket exists
 *   2. Upload a small test file
 *   3. Generate a signed URL
 *   4. Delete the test file
 *   5. Insert to software_installers (verifies no auth.users FK error)
 *   6. Insert a second null-serial inventory item (verifies partial index)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
  if (m) { let v = (m[2]||'').trim(); if (v.startsWith('"')) v=v.slice(1,-1); env[m[1]] = v; }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET = 'software-binaries';
const TEST_FILE_PATH = 'test/verify_upload_fix_test.txt';
const FAKE_USER_ID = 'verify-script-user';
const FAKE_COMPANY = '0705d47e-3245-483f-8143-7f7150824119'; // from existing item

async function run() {
  console.log('\n── 1. Check bucket exists ──────────────────────────────');
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) { console.error('FAIL - list buckets:', bErr.message); process.exit(1); }
  const bucket = buckets.find(b => b.name === BUCKET);
  if (!bucket) { console.error('FAIL - bucket "software-binaries" not found. Run the SQL fix first!'); process.exit(1); }
  console.log('PASS - bucket found:', bucket.name, '| public:', bucket.public);

  console.log('\n── 2. Upload test file ─────────────────────────────────');
  const testContent = Buffer.from('TAJ AssetFlow upload test - ' + new Date().toISOString());
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(TEST_FILE_PATH, testContent, {
    contentType: 'text/plain', upsert: true
  });
  if (upErr) { console.error('FAIL - upload:', upErr.message); process.exit(1); }
  console.log('PASS - file uploaded to', TEST_FILE_PATH);

  console.log('\n── 3. Generate signed URL ──────────────────────────────');
  const { data: urlData, error: urlErr } = await supabase.storage.from(BUCKET).createSignedUrl(TEST_FILE_PATH, 60);
  if (urlErr) { console.error('FAIL - signed URL:', urlErr.message); }
  else console.log('PASS - signed URL generated (expires in 60s)');

  console.log('\n── 4. Delete test file ─────────────────────────────────');
  const { error: delErr } = await supabase.storage.from(BUCKET).remove([TEST_FILE_PATH]);
  if (delErr) { console.error('FAIL - delete:', delErr.message); }
  else console.log('PASS - test file cleaned up');

  console.log('\n── 5. Insert to software_installers (custom user ID) ───');
  // get existing item id
  const { data: items } = await supabase.from('inventory_items').select('id').limit(1);
  if (!items || items.length === 0) { console.log('SKIP - no inventory items to reference'); }
  else {
    const { error: siErr } = await supabase.from('software_installers').insert({
      inventory_item_id: items[0].id,
      file_name: 'verify_test.txt',
      file_path: 'test/verify_test.txt',
      file_size_bytes: 42,
      version: 'verify-1.0',
      download_count: 0,
      uploaded_by: FAKE_USER_ID,  // custom ID, not in auth.users
    }).select('id');
    if (siErr) { console.error('FAIL - software_installers insert:', siErr.message); }
    else {
      console.log('PASS - software_installers insert succeeded with custom user ID');
      // cleanup
      const { data: inserted } = await supabase.from('software_installers')
        .select('id').eq('file_path', 'test/verify_test.txt').limit(1);
      if (inserted?.[0]) await supabase.from('software_installers').delete().eq('id', inserted[0].id);
    }
  }

  console.log('\n── 6. Insert second null-serial software item ──────────');
  const { data: existingItems } = await supabase.from('inventory_items').select('*').limit(1);
  if (!existingItems || existingItems.length === 0) { console.log('SKIP - no items to reference'); }
  else {
    const ref = existingItems[0];
    const { data: inserted2, error: insErr } = await supabase.from('inventory_items').insert({
      company_id: ref.company_id,
      category_id: ref.category_id,
      location_id: ref.location_id,
      name: 'Verify Test Software Item',
      serial_number: null,
      status_state: 'New',
      quantity: 1,
      minimum_safety_stock: 0,
    }).select('id');
    if (insErr) { console.error('FAIL - null serial insert:', insErr.message); }
    else {
      console.log('PASS - second null-serial item inserted successfully');
      if (inserted2?.[0]) await supabase.from('inventory_items').delete().eq('id', inserted2[0].id);
      console.log('PASS - cleanup done');
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('All checks complete. If all show PASS, the fix is working!');
}

run().catch(e => { console.error('Unexpected error:', e); process.exit(1); });
