import type { Exercise } from "@shared/schema";

interface AirtableRecord {
  id: string;
  fields: {
    "Exercise Name"?: string;
    "Category"?: string;
    "Equipment"?: string;
    "Primary Muscles"?: string;
    "Secondary Muscles"?: string;
    "Movement Pattern"?: string;
    "Difficulty"?: number;
    "Setup Instructions"?: string;
    "Execution Steps"?: string;
    "Safety Tips"?: string;
    "Anchor Type"?: string;
    "Setup Time"?: string;
    "Equipment Zone"?: string;
    "Best Paired With"?: string;
    "Coaching Tips"?: string;
    "Mistakes"?: string;
    "Variations"?: string;
  };
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

export class AirtableService {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor() {
    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    
    if (!apiKey || !baseId) {
      throw new Error("Missing Airtable credentials");
    }

    console.log(`Airtable Service initialized with Base ID: ${baseId.substring(0, 8)}...`);
    
    this.baseUrl = `https://api.airtable.com/v0/${baseId}`;
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private parseArrayField(field: string | string[] | undefined): string[] {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
      return field.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  private parseInstructionField(field: string | string[] | undefined): string[] {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
      return field.split('\n').map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  private transformRecord(record: AirtableRecord): Exercise {
    const fields = record.fields;
    
    return {
      id: record.id.hashCode(), // Convert Airtable ID to number
      name: fields["Exercise Name"] || "Unknown Exercise",
      category: fields["Category"]?.toLowerCase() || "general",
      equipment: fields["Equipment"]?.toLowerCase() || "bodyweight",
      primaryMuscles: this.parseArrayField(fields["Primary Muscles"]),
      secondaryMuscles: this.parseArrayField(fields["Secondary Muscles"]),
      movementPattern: fields["Movement Pattern"]?.toLowerCase().replace(/\s+/g, '_') || "general",
      difficulty: fields["Difficulty"] || 1,
      instructions: {
        setup: fields["Setup Instructions"] || "No setup instructions provided",
        execution: this.parseInstructionField(fields["Execution Steps"]),
        safetyTips: this.parseInstructionField(fields["Safety Tips"])
      },
      anchorType: fields["Anchor Type"] ? String(fields["Anchor Type"]) : null,
      setupTime: fields["Setup Time"] ? String(fields["Setup Time"]) : null,
      equipmentZone: fields["Equipment Zone"] ? String(fields["Equipment Zone"]) : null,
      bestPairedWith: this.parseArrayField(fields["Best Paired With"]),
      coachingTips: this.parseInstructionField(fields["Coaching Tips"]),
      mistakes: this.parseInstructionField(fields["Mistakes"]),
      variations: this.parseInstructionField(fields["Variations"])
    };
  }

  async getAllExercises(): Promise<Exercise[]> {
    try {
      const exercises: Exercise[] = [];
      let offset: string | undefined;

      do {
        const url = new URL(`${this.baseUrl}/tbl18qgnmJIyf3Cu9`);
        if (offset) {
          url.searchParams.set('offset', offset);
        }

        const response = await fetch(url.toString(), {
          headers: this.headers,
        });

        if (!response.ok) {
          throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
        }

        const data: AirtableResponse = await response.json();
        
        for (const record of data.records) {
          try {
            exercises.push(this.transformRecord(record));
          } catch (error) {
            console.warn(`Failed to transform record ${record.id}:`, error);
          }
        }

        offset = data.offset;
      } while (offset);

      return exercises;
    } catch (error) {
      console.error("Failed to fetch exercises from Airtable:", error);
      throw error;
    }
  }

  async getExerciseByName(name: string): Promise<Exercise | null> {
    try {
      const url = new URL(`${this.baseUrl}/tbl18qgnmJIyf3Cu9`);
      url.searchParams.set('filterByFormula', `{Exercise Name} = "${name}"`);

      const response = await fetch(url.toString(), {
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data: AirtableResponse = await response.json();
      
      if (data.records.length > 0) {
        return this.transformRecord(data.records[0]);
      }

      return null;
    } catch (error) {
      console.error("Failed to fetch exercise by name from Airtable:", error);
      throw error;
    }
  }
}

// Helper extension for string hashing
declare global {
  interface String {
    hashCode(): number;
  }
}

String.prototype.hashCode = function() {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

export const airtableService = new AirtableService();