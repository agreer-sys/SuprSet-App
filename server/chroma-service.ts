import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface KnowledgeItem {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    title: string;
    category: string;
    tags: string;
    source: string;
  };
}

let knowledgeStore: KnowledgeItem[] = [];
const KNOWLEDGE_CACHE_PATH = path.join(process.cwd(), 'knowledge-base', 'embeddings-cache.json');

export async function initializeKnowledgeStore() {
  try {
    if (fs.existsSync(KNOWLEDGE_CACHE_PATH)) {
      const cacheData = fs.readFileSync(KNOWLEDGE_CACHE_PATH, 'utf-8');
      knowledgeStore = JSON.parse(cacheData);
      console.log(`✅ Loaded ${knowledgeStore.length} knowledge items from cache`);
    } else {
      console.log('⚠️ No knowledge cache found. Run: tsx server/ingest-knowledge.ts');
      knowledgeStore = [];
    }
    return { initialized: true };
  } catch (error) {
    console.error('❌ Knowledge store initialization failed:', error);
    knowledgeStore = [];
    return { initialized: false };
  }
}

export async function addKnowledge(
  id: string,
  content: string,
  metadata: {
    title: string;
    category: string;
    tags?: string[];
    source?: string;
  }
): Promise<KnowledgeItem> {
  const embedding = await generateEmbedding(content);

  const item: KnowledgeItem = {
    id,
    content,
    embedding,
    metadata: {
      title: metadata.title,
      category: metadata.category,
      tags: metadata.tags ? metadata.tags.join(', ') : '',
      source: metadata.source || '',
    },
  };

  console.log(`✅ Generated embedding for: ${metadata.title}`);
  return item;
}

export function saveKnowledgeCache(items: KnowledgeItem[]) {
  const cacheDir = path.dirname(KNOWLEDGE_CACHE_PATH);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  knowledgeStore = items;
  fs.writeFileSync(KNOWLEDGE_CACHE_PATH, JSON.stringify(items, null, 2));
  console.log(`✅ Saved ${items.length} items to cache and loaded into memory`);
}

export async function searchKnowledge(
  query: string,
  limit: number = 3
): Promise<Array<{ content: string; metadata: any; score: number }>> {
  if (knowledgeStore.length === 0) {
    console.warn('⚠️ Knowledge store empty, returning empty results');
    return [];
  }

  try {
    const queryEmbedding = await generateEmbedding(query);

    const scoredResults = knowledgeStore.map(item => ({
      content: item.content,
      metadata: item.metadata,
      score: cosineSimilarity(queryEmbedding, item.embedding),
    }));

    scoredResults.sort((a, b) => b.score - a.score);

    return scoredResults.slice(0, limit);
  } catch (error) {
    console.error('❌ Knowledge search failed:', error);
    return [];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

export async function clearKnowledge() {
  knowledgeStore = [];
  if (fs.existsSync(KNOWLEDGE_CACHE_PATH)) {
    fs.unlinkSync(KNOWLEDGE_CACHE_PATH);
  }
  console.log('✅ Knowledge base cleared');
}

export function getKnowledgeStats() {
  return {
    initialized: knowledgeStore.length > 0,
    count: knowledgeStore.length,
    cacheExists: fs.existsSync(KNOWLEDGE_CACHE_PATH),
  };
}
