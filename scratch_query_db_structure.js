const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

async function checkStructure() {
  console.log('Checking assets table/view...');
  const { data: assetData, error: assetError } = await supabase.from('assets').select('*').limit(1);
  if (assetError) {
    console.error('Error fetching assets:', assetError);
  } else {
    console.log('Assets row columns:', assetData[0] ? Object.keys(assetData[0]) : 'No rows');
  }

  console.log('\nChecking inventory_items table...');
  const { data: invData, error: invError } = await supabase.from('inventory_items').select('*').limit(1);
  if (invError) {
    console.error('Error fetching inventory_items:', invError);
  } else {
    console.log('Inventory_items row columns:', invData[0] ? Object.keys(invData[0]) : 'No rows');
  }
}

checkStructure();
