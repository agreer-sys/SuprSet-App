import type { Exercise } from "@shared/schema";

interface AirtableRecord {
  id: string;
  fields: {
    "Exercise Name"?: string;
    "Alternative Names"?: string;
    "Primary Muscle Group"?: string;
    "Secondary Muscle Group"?: string | string[];
    "Equipment"?: string;
    "Difficulty Level"?: string;
    "Exercise Type"?: string;
    "Movement Pattern"?: string;
    "Exercise Category"?: string | string[];
    "Pairing Compatibility"?: string | string[];
    "Coaching Bullet Points"?: string;
    "Common Mistakes"?: string;
    "Exercise Variations"?: string;
    "Contraindications"?: string;
    "Exercise Tempo"?: string;
    "Ideal Rep Range"?: string;
    "Rest Period (sec)"?: number;
    "Estimated Time per Set (sec)"?: number;
    "Tags"?: string | string[];
    "Anchor Type"?: string;
    "Best Paired With"?: string | string[];
    "Equipment Zone"?: string;
    "Setup Time"?: string;
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
      id: record.id.hashCode(),
      name: fields["Exercise Name"] || "Unknown Exercise",
      // New comprehensive fields from your 22-field Airtable structure
      alternativeNames: fields["Alternative Names"] || null,
      primaryMuscleGroup: fields["Primary Muscle Group"] || null,
      secondaryMuscleGroup: this.parseArrayField(fields["Secondary Muscle Group"]),
      equipment: fields["Equipment"] || "bodyweight",
      difficultyLevel: fields["Difficulty Level"] || null,
      exerciseType: fields["Exercise Type"] || null,
      exerciseCategory: this.parseArrayField(fields["Exercise Category"]),
      pairingCompatibility: this.parseArrayField(fields["Pairing Compatibility"]),
      coachingBulletPoints: fields["Coaching Bullet Points"] || null,
      commonMistakes: fields["Common Mistakes"] || null,
      exerciseVariations: fields["Exercise Variations"] || null,
      contraindications: fields["Contraindications"] || null,
      exerciseTempo: fields["Exercise Tempo"] || null,
      idealRepRange: fields["Ideal Rep Range"] || null,
      restPeriodSec: fields["Rest Period (sec)"] || null,
      estimatedTimePerSetSec: fields["Estimated Time per Set (sec)"] || null,
      tags: this.parseArrayField(fields["Tags"]),
      anchorType: fields["Anchor Type"] ? String(fields["Anchor Type"]) : null,
      setupTime: fields["Setup Time"] ? String(fields["Setup Time"]) : null,
      equipmentZone: fields["Equipment Zone"] ? String(fields["Equipment Zone"]) : null,
      bestPairedWith: this.parseArrayField(fields["Best Paired With"]),
      
      // Legacy fields for compatibility with existing frontend
      category: this.parseArrayField(fields["Exercise Category"])[0] || "general",
      primaryMuscles: fields["Primary Muscle Group"] ? [fields["Primary Muscle Group"]] : [],
      secondaryMuscles: this.parseArrayField(fields["Secondary Muscle Group"]),
      movementPattern: fields["Movement Pattern"]?.toLowerCase()?.replace(/\s+/g, '_').replace('/', '_') || "general",
      difficulty: this.mapDifficultyToNumber(fields["Difficulty Level"]),
      instructions: {
        setup: "See coaching notes",
        execution: fields["Coaching Bullet Points"] ? this.parseInstructionField(fields["Coaching Bullet Points"]) : [],
        safetyTips: fields["Common Mistakes"] ? this.parseInstructionField(fields["Common Mistakes"]) : []
      },
      coachingTips: fields["Coaching Bullet Points"] ? this.parseInstructionField(fields["Coaching Bullet Points"]) : [],
      mistakes: fields["Common Mistakes"] ? this.parseInstructionField(fields["Common Mistakes"]) : [],
      variations: fields["Exercise Variations"] ? this.parseInstructionField(fields["Exercise Variations"]) : []
    };
  }

  private mapDifficultyToNumber(difficulty: string | undefined): number {
    switch (difficulty?.toLowerCase()) {
      case "beginner": return 1;
      case "intermediate": return 2;
      case "advanced": return 3;
      default: return 1;
    }
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
        // Sort by Exercise Name to match database view order
        url.searchParams.set('sort[0][field]', 'Exercise Name');
        url.searchParams.set('sort[0][direction]', 'asc');

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