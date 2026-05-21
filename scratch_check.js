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

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseKey ? 'Found' : 'Missing');

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCheck() {
  try {
    console.log('Fetching inventory items...');
    const { data: items, error } = await supabase.from('inventory_items').select('id, name, serial_number, company_id');
    if (error) {
      console.error('Error fetching inventory items:', error);
      return;
    }
    console.log(`Found ${items.length} items:`);
    items.forEach(item => {
      console.log(`- ID: ${item.id}, Name: ${item.name}, Serial: ${JSON.stringify(item.serial_number)}, Company: ${item.company_id}`);
    });
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

runCheck();
