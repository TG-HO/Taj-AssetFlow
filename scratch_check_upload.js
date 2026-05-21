const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCheck() {
  try {
    console.log('Testing upload using client...');
    
    // Create a small dummy file buffer
    const buffer = Buffer.from('hello world from test');
    const filePath = `test-upload-${Date.now()}.txt`;
    
    // Try anonymous upload
    console.log('Attempting anonymous upload...');
    const { data: anonData, error: anonErr } = await supabase.storage
      .from('software-binaries')
      .upload(filePath, buffer, {
        contentType: 'text/plain',
        upsert: true
      });
      
    if (anonErr) {
      console.error('Anonymous upload failed:', anonErr);
    } else {
      console.log('Anonymous upload succeeded:', anonData);
      // Clean up
      const { data: delData, error: delErr } = await supabase.storage
        .from('software-binaries')
        .remove([filePath]);
      console.log('Cleanup:', delErr ? `Failed to delete: ${delErr.message}` : 'Deleted');
    }
  } catch (error) {
    console.error('Error in script:', error);
  }
}

runCheck();
