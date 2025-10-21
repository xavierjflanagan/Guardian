import OpenAI from 'openai';
import * as fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

async function generateEmbeddings() {
  const medications = [
    'Current Medication: Metformin 500mg twice daily',
    'Current Medication: Perindopril 4mg once daily'
  ];

  const results = [];

  for (const med of medications) {
    console.log(`Generating embedding for: ${med}`);

    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: med
    });

    const embedding = embeddingResponse.data[0].embedding;

    results.push({
      medication: med,
      embedding: embedding,
      postgresArray: `ARRAY[${embedding.join(',')}]::vector`
    });

    console.log(`✓ Generated (${embedding.length} dimensions)\n`);
  }

  // Save for SQL testing
  fs.writeFileSync('pass1-entity-embeddings.json', JSON.stringify(results, null, 2));
  console.log('✓ Saved to pass1-entity-embeddings.json');
}

generateEmbeddings().catch(console.error);
