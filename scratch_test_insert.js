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

async function testInsert() {
  console.log('Testing insert of a second software item with null serial...');
  
  // Let's get the company_id and category_id and location_id of the existing item
  const { data: items, error: fetchError } = await supabase
    .from('inventory_items')
    .select('*')
    .limit(1);
    
  if (fetchError) {
    console.error('Error fetching existing item:', fetchError);
    return;
  }
  
  if (!items || items.length === 0) {
    console.log('No existing items in inventory_items. Inserting first item...');
    return;
  }
  
  const existing = items[0];
  console.log('Existing item:', existing);
  
  const payload = {
    company_id: existing.company_id,
    category_id: existing.category_id,
    location_id: existing.location_id,
    name: 'Test Software Null Serial 2',
    serial_number: null,
    status_state: 'New',
    quantity: 1,
    minimum_safety_stock: 0
  };
  
  console.log('Inserting payload:', payload);
  const { data: inserted, error: insertError } = await supabase
    .from('inventory_items')
    .insert(payload)
    .select('*');
    
  if (insertError) {
    console.log('Insert FAILED with error:');
    console.log(JSON.stringify(insertError, null, 2));
  } else {
    console.log('Insert SUCCEEDED! Inserted data:', inserted);
    
    // Clean up
    console.log('Cleaning up inserted test item...');
    const { error: cleanError } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', inserted[0].id);
      
    if (cleanError) {
      console.error('Failed to cleanup:', cleanError);
    } else {
      console.log('Cleanup completed successfully.');
    }
  }
}

testInsert();
