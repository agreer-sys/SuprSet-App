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

  private parseArrayField(field: string | undefined): string[] {
    if (!field) return [];
    return field.split(',').map(item => item.trim()).filter(Boolean);
  }

  private parseInstructionField(field: string | undefined): string[] {
    if (!field) return [];
    return field.split('\n').map(item => item.trim()).filter(Boolean);
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
      anchorType: fields["Anchor Type"],
      setupTime: fields["Setup Time"],
      equipmentZone: fields["Equipment Zone"],
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
        // Test multiple possible table name variations
        const tableVariations = [
          'Exercises%20Master%20Library',
          'Exercise%20Master%20Library',
          'Exercises',
          'Exercise%20Library',
          'Master%20Library',
          'tblYourTableId' // If you know your table ID, it starts with 'tbl'
        ];

        let response: Response | null = null;
        let successfulTableName = '';
        
        for (const tableName of tableVariations) {
          const testUrl = new URL(`${this.baseUrl}/${tableName}`);
          if (offset) {
            testUrl.searchParams.set('offset', offset);
          }

          console.log(`Testing table name: ${decodeURIComponent(tableName)}`);
          
          try {
            response = await fetch(testUrl.toString(), {
              headers: this.headers,
            });
            
            if (response.ok) {
              successfulTableName = tableName;
              console.log(`Successfully connected to table: ${decodeURIComponent(tableName)}`);
              break;
            } else {
              console.log(`Failed for ${decodeURIComponent(tableName)}: ${response.status} ${response.statusText}`);
            }
          } catch (error) {
            console.log(`Error testing ${decodeURIComponent(tableName)}:`, error);
          }
        }

        if (!response || !response.ok) {
          // List available tables to help debug
          const listTablesUrl = new URL(`${this.baseUrl}/`);
          try {
            const listResponse = await fetch(listTablesUrl.toString(), {
              headers: this.headers,
            });
            if (listResponse.ok) {
              const listData = await listResponse.json();
              console.log('Available tables in base:', listData);
            }
          } catch (error) {
            console.log('Could not list tables:', error);
          }
          
          throw new Error(`Could not find table. Tried: ${tableVariations.map(t => decodeURIComponent(t)).join(', ')}`);
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
      const url = new URL(`${this.baseUrl}/Exercises%20Master%20Library`);
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