/**
 * force_create_bucket.js
 * 
 * Tries every possible method to create the software-binaries bucket.
 * The anon key cannot create buckets via the JS storage API due to RLS.
 * But we can try via the PostgREST data API if RLS allows it,
 * or via the Supabase Management API (requires service role or PAT).
 */
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const fs = require('fs'), path = require('path');

const env = {};
fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
  if (m) { let v = (m[2]||'').trim(); if(v.startsWith('"'))v=v.slice(1,-1); env[m[1]]=v; }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const projectRef = supabaseUrl.replace('https://','').replace('.supabase.co','');

const supabase = createClient(supabaseUrl, supabaseKey);

function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } };
    const req = https.request(options, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, body: buf }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Project ref:', projectRef);
  
  // Method 1: Try storage JS API without size limit
  console.log('\n── Method 1: JS storage API (no size limit) ────────');
  const { data: m1, error: e1 } = await supabase.storage.createBucket('software-binaries', { public: false });
  if (!e1) { console.log('SUCCESS via Method 1!', m1); }
  else { console.log('Failed:', e1.message); }

  // Method 2: Try direct PostgREST insert into storage.buckets
  console.log('\n── Method 2: PostgREST storage schema insert ────────');
  // PostgREST doesn't expose storage schema, but let's try
  const { data: m2, error: e2 } = await supabase.schema('storage').from('buckets').insert({
    id: 'software-binaries',
    name: 'software-binaries',
    public: false,
  }).select();
  if (!e2) { console.log('SUCCESS via Method 2!', m2); }
  else { console.log('Failed:', e2.message || JSON.stringify(e2)); }

  // Check if bucket exists now
  console.log('\n── Final check ──────────────────────────────────────');
  const { data: buckets } = await supabase.storage.listBuckets();
  const found = buckets?.find(b => b.name === 'software-binaries');
  if (found) {
    console.log('✅ Bucket EXISTS! Config:', JSON.stringify(found, null, 2));
  } else {
    console.log('❌ Bucket still does not exist.');
    console.log('\n>>> ONLY FIX: Run this SQL in Supabase Dashboard SQL Editor:');
    console.log('>>> URL: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('\nCopy-paste this exact SQL:\n');
    console.log(`INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('software-binaries', 'software-binaries', false, NULL)
ON CONFLICT (id) DO UPDATE SET file_size_limit = NULL, allowed_mime_types = NULL;

DROP POLICY IF EXISTS "Allow public select for software-binaries" ON storage.objects;
CREATE POLICY "Allow public select for software-binaries" ON storage.objects FOR SELECT TO public USING (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public insert for software-binaries" ON storage.objects;
CREATE POLICY "Allow public insert for software-binaries" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public update for software-binaries" ON storage.objects;
CREATE POLICY "Allow public update for software-binaries" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'software-binaries') WITH CHECK (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public delete for software-binaries" ON storage.objects;
CREATE POLICY "Allow public delete for software-binaries" ON storage.objects FOR DELETE TO public USING (bucket_id = 'software-binaries');`);
  }
}
main().catch(e => console.error(e.message));
