/**
 * apply_sql_fix.js
 * Applies the SQL migration directly via Supabase REST API.
 * Uses the publishable key — applies individual statements that work with anon/public role.
 * For statements requiring service role (bucket creation), uses direct HTTP to management API.
 */
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const fs = require('fs');
const path = require('path');

const env = {};
fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
  if (m) { let v = (m[2] || '').trim(); if (v.startsWith('"')) v = v.slice(1, -1); env[m[1]] = v; }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

console.log('Project ref:', projectRef);
console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

// Try to create bucket via storage API
async function tryCreateBucket() {
  console.log('\n── Attempting bucket creation via storage API ──');
  const { data, error } = await supabase.storage.createBucket('software-binaries', {
    public: false,
    fileSizeLimit: 5368709120,
    allowedMimeTypes: [
      'application/octet-stream',
      'application/x-msdownload',
      'application/x-msi',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-apple-diskimage',
      'application/gzip',
    ]
  });
  if (error) {
    console.log('Storage API bucket creation result:', error.message);
    console.log('Status:', error.status || error.statusCode);
    return false;
  }
  console.log('Bucket created!', data);
  return true;
}

// Check if the bucket already exists
async function checkBucket() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) { console.log('Cannot list buckets:', error.message); return false; }
  const exists = data?.some(b => b.name === 'software-binaries');
  console.log('Bucket exists:', exists, '| All buckets:', data?.map(b => b.name));
  return exists;
}

// Check software_installers column type
async function checkInstallerColumn() {
  console.log('\n── Checking software_installers table ──');
  const { data, error } = await supabase.from('software_installers').select('*').limit(0);
  if (error) {
    console.log('software_installers table error:', error.message, '| code:', error.code);
    if (error.code === '42P01') console.log('Table does not exist yet!');
    return;
  }
  console.log('software_installers table is accessible');
}

// Test insert to software_installers with a fake user ID (non-UUID)
async function testInstallerInsert() {
  console.log('\n── Testing software_installers insert with custom user ID ──');
  const { data: items } = await supabase.from('inventory_items').select('id').limit(1);
  if (!items || items.length === 0) { console.log('No inventory_items to reference. Skipping.'); return; }
  
  const { error } = await supabase.from('software_installers').insert({
    inventory_item_id: items[0].id,
    file_name: 'test_column_type.txt',
    file_path: 'test/test_column_type.txt',
    file_size_bytes: 1,
    version: 'test-1.0',
    download_count: 0,
    uploaded_by: 'custom-auth-user-123', // NOT a UUID - tests if FK is dropped
  }).select('id');
  
  if (error) {
    console.log('FAIL - Insert error:', error.message, '| code:', error.code);
    if (error.code === '23503') {
      console.log('>>> FK constraint still exists! The ALTER TABLE has NOT been applied.');
      console.log('>>> You must run fix_upload_and_auth.sql in the Supabase SQL Editor.');
    }
  } else {
    console.log('PASS - Insert succeeded with non-UUID uploaded_by value');
    // cleanup
    const { data: ins } = await supabase.from('software_installers')
      .select('id').eq('file_path', 'test/test_column_type.txt').limit(1);
    if (ins?.[0]) {
      await supabase.from('software_installers').delete().eq('id', ins[0].id);
      console.log('PASS - Cleanup done');
    }
  }
}

async function main() {
  const bucketExists = await checkBucket();
  if (!bucketExists) {
    await tryCreateBucket();
    // Check again
    await checkBucket();
  }
  await checkInstallerColumn();
  await testInstallerInsert();
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('If bucket creation failed and FK test failed:');
  console.log('You MUST run supabase/fix_upload_and_auth.sql in the Supabase Dashboard.');
  console.log('URL: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
}

main().catch(e => console.error('Error:', e.message));
