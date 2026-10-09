const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://fcsrwywlhmcusqababtq.supabase.co',
  'sb_secret_H-UvBK5X338oR56-kj6seQ_ZyVeAFfE'
);

async function inspect() {
  const { data: profiles } = await supabase.from('profiles').select('*');
  const { data: staff } = await supabase.from('staff_profiles').select('*');
  const { data: mappings } = await supabase.from('telegram_mappings').select('*');

  console.log('=== PROFILES IN DB ===');
  profiles?.forEach((p) => {
    console.log(`- Name: ${p.full_name}, Email: ${p.email}, Phone: ${p.phone}, Role: ${p.role}, ID: ${p.id}`);
  });

  console.log('\n=== STAFF PROFILES IN DB ===');
  staff?.forEach((s) => {
    console.log(`- EmpID: ${s.employee_id}, Phone: ${s.phone}, Role: ${s.role}, UserID: ${s.user_id}`);
  });

  console.log('\n=== TELEGRAM MAPPINGS IN DB ===');
  console.log(mappings);
}

inspect();
