/**
 * check_bucket_limits.js - Diagnose the current bucket configuration
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs'), path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
  if (m) { let v = (m[2]||'').trim(); if(v.startsWith('"'))v=v.slice(1,-1); env[m[1]]=v; }
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function main() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) { console.error('Cannot list buckets:', error.message); return; }
  
  const bucket = buckets?.find(b => b.name === 'software-binaries');
  if (!bucket) {
    console.log('BUCKET NOT FOUND - need to run SQL fix first!');
    return;
  }
  
  console.log('Bucket found!');
  console.log('Full bucket config:', JSON.stringify(bucket, null, 2));
  
  const limitBytes = bucket.file_size_limit;
  if (limitBytes === null || limitBytes === undefined) {
    console.log('file_size_limit: NULL (uses project-level limit)');
  } else {
    console.log(`file_size_limit: ${limitBytes} bytes = ${(limitBytes/1024/1024).toFixed(1)} MB`);
  }
  console.log('allowed_mime_types:', bucket.allowed_mime_types || 'NULL (any type allowed)');
}
main().catch(e => console.error(e.message));
