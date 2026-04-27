const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pforvhpmkbplrhlmtpbt.supabase.co';
const supabaseKey = 'sb_publishable_U9XHOcgZ4cnNjaKCBYlDpA_rViOsgRE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('assets').select('*').limit(1);
  if (error) console.log('assets table error:', error);
  else console.log('assets table exists:', data);
  
  const { data: d2, error: e2 } = await supabase.from('inventory').select('*').limit(1);
  if (e2) console.log('inventory table error:', e2);
  else console.log('inventory table exists:', d2);
}
check();
