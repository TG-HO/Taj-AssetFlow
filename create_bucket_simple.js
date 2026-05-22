/**
 * create_bucket_simple.js
 * Creates the software-binaries bucket with no size limit override
 * (Supabase default limit applies - can be raised in Dashboard).
 * Also tries to verify/test upload after creation.
 */
const { createClient } = require('@supabase/supabase-js');
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

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('── Step 1: Check existing buckets ──────────────────────────');
  const { data: existing } = await supabase.storage.listBuckets();
  console.log('Current buckets:', existing?.map(b => b.name) || []);
  
  if (existing?.some(b => b.name === 'software-binaries')) {
    console.log('Bucket already exists! Skipping creation.');
  } else {
    console.log('\n── Step 2: Create bucket (no size limit) ────────────────────');
    // Try without fileSizeLimit first
    const { data: created, error: err1 } = await supabase.storage.createBucket('software-binaries', {
      public: false,
    });
    if (err1) {
      console.log('FAIL without limit:', err1.message);
      console.log('\n>>> MANUAL ACTION REQUIRED <<<');
      console.log('The anon key cannot create buckets due to RLS restrictions.');
      console.log('Please run this SQL in the Supabase SQL Editor:');
      console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
      console.log('\nSQL to run:\n');
      const sql = fs.readFileSync(path.join(__dirname, 'supabase', 'fix_upload_and_auth.sql'), 'utf8');
      console.log(sql);
      return;
    }
    console.log('PASS - Bucket created:', created);
  }

  console.log('\n── Step 3: Test upload ──────────────────────────────────────');
  const testContent = Buffer.from('test-' + Date.now());
  const { error: upErr } = await supabase.storage
    .from('software-binaries')
    .upload('test/ping.txt', testContent, { contentType: 'text/plain', upsert: true });
  
  if (upErr) {
    console.log('Upload FAIL:', upErr.message);
    console.log('This likely means the storage RLS policies are not applied yet.');
    console.log('Run fix_upload_and_auth.sql in the Supabase SQL Editor.');
  } else {
    console.log('PASS - Upload works!');
    await supabase.storage.from('software-binaries').remove(['test/ping.txt']);
    console.log('PASS - Cleanup done. Storage is fully operational!');
  }
}

main().catch(e => console.error('Error:', e.message));
