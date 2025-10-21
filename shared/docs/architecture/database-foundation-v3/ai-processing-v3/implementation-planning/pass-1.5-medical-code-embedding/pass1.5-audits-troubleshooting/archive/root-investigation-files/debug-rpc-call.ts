import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugRPCCall() {
  console.log('=== DEBUGGING RPC CALL ===\n');

  // Generate embedding
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: 'Cholecystectomy'
  });

  const embedding = embeddingResponse.data[0].embedding;

  console.log(`Embedding dimensions: ${embedding.length}`);
  console.log(`Embedding type: ${typeof embedding}`);
  console.log(`Is array: ${Array.isArray(embedding)}`);
  console.log(`First 5 values: [${embedding.slice(0, 5).join(', ')}]\n`);

  // Call RPC with detailed error logging
  console.log('Calling search_regional_codes RPC...\n');

  const { data, error, status, statusText } = await supabase.rpc('search_regional_codes', {
    query_embedding: embedding,
    entity_type_filter: 'procedure',
    country_code_filter: 'AUS',
    max_results: 10,
    min_similarity: 0.0
  });

  console.log(`Status: ${status} ${statusText}`);
  console.log(`Error: ${error ? JSON.stringify(error, null, 2) : 'null'}`);
  console.log(`Data type: ${typeof data}`);
  console.log(`Data is array: ${Array.isArray(data)}`);
  console.log(`Data length: ${data ? data.length : 'N/A'}`);
  console.log(`Data content: ${JSON.stringify(data, null, 2)}`);
}

debugRPCCall().catch(console.error);
