import fs from 'fs';
import path from 'path';
import { addKnowledge, saveKnowledgeCache, clearKnowledge } from './chroma-service';

interface KnowledgeDocument {
  id: string;
  content: string;
  metadata: {
    title: string;
    category: string;
    tags?: string[];
    source: string;
  };
}

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

async function processMarkdownFiles(directory: string, category: string): Promise<KnowledgeDocument[]> {
  const documents: KnowledgeDocument[] = [];
  
  if (!fs.existsSync(directory)) {
    console.log(`⚠️ Directory not found: ${directory}`);
    return documents;
  }

  const files = fs.readdirSync(directory).filter(file => file.endsWith('.md'));

  for (const file of files) {
    try {
      const filePath = path.join(directory, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      if (!content || content.trim().length === 0) {
        console.warn(`⚠️ Skipping empty file: ${file}`);
        continue;
      }

      const title = file.replace('.md', '').replace(/-/g, ' ');
      const id = `${category}-${file.replace('.md', '')}`;

      const tags = extractTags(content);

      documents.push({
        id,
        content,
        metadata: {
          title,
          category,
          tags,
          source: filePath,
        },
      });
    } catch (error) {
      console.error(`❌ Error processing file ${file}:`, error);
    }
  }

  return documents;
}

function extractTags(content: string): string[] {
  try {
    const tagMatch = content.match(/tags:\s*\[([^\]]+)\]/i);
    if (tagMatch && tagMatch[1]) {
      return tagMatch[1].split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }
  } catch (error) {
    console.warn('Warning: Failed to parse tags from frontmatter');
  }
  return [];
}

async function ingestAllKnowledge() {
  console.log('🚀 Starting knowledge base ingestion...');

  const knowledgeBaseDir = path.join(process.cwd(), 'knowledge-base');
  const categories = [
    { dir: 'coaching-philosophy', name: 'Philosophy' },
    { dir: 'exercise-guides', name: 'Exercise Guide' },
    { dir: 'training-principles', name: 'Training Principle' },
  ];

  const allItems: KnowledgeItem[] = [];

  for (const category of categories) {
    const categoryPath = path.join(knowledgeBaseDir, category.dir);
    const documents = await processMarkdownFiles(categoryPath, category.name);

    for (const doc of documents) {
      const item = await addKnowledge(doc.id, doc.content, doc.metadata);
      allItems.push(item);
    }

    console.log(`✅ Processed ${documents.length} documents from ${category.name}`);
  }

  saveKnowledgeCache(allItems);
  console.log(`\n🎉 Ingestion complete! Generated embeddings for ${allItems.length} documents`);
}

async function reingestKnowledge() {
  console.log('🔄 Clearing existing knowledge base...');
  await clearKnowledge();
  await ingestAllKnowledge();
}

const command = process.argv[2];

if (command === 'reingest') {
  reingestKnowledge().catch(console.error);
} else {
  ingestAllKnowledge().catch(console.error);
}
