import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://napoydbbuvbpyciwjdci.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function countEmbeddings() {
  console.log('=== Embedding Counts by Code System ===\n');

  // Get all code systems
  const { data: systems } = await supabase
    .from('universal_medical_codes')
    .select('code_system')
    .limit(1000);

  const uniqueSystems = [...new Set(systems?.map(s => s.code_system) || [])];

  for (const system of uniqueSystems) {
    // Total count
    const { count: total } = await supabase
      .from('universal_medical_codes')
      .select('id', { count: 'exact', head: true })
      .eq('code_system', system);

    // With embeddings
    const { count: withEmbeddings } = await supabase
      .from('universal_medical_codes')
      .select('id', { count: 'exact', head: true })
      .eq('code_system', system)
      .not('embedding', 'is', null);

    const percentage = total ? ((withEmbeddings || 0) / total * 100).toFixed(1) : '0.0';

    console.log(`${system.toUpperCase()}:`);
    console.log(`  Total codes: ${total?.toLocaleString()}`);
    console.log(`  With embeddings: ${withEmbeddings?.toLocaleString()}`);
    console.log(`  Coverage: ${percentage}%`);
    console.log('');
  }
}

countEmbeddings().catch(console.error);
