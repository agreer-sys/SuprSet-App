import type { Exercise } from "@shared/schema";

interface AirtableRecord {
  id: string;
  fields: {
    "Exercise Name"?: string;
    "Alternative Names"?: string;
    "Primary Muscle Group"?: string;
    "Secondary Muscle Group"?: string | string[];
    "Equipment"?: string;
    "Equipment (Primary)"?: string;
    "Equipment 2 (Secondary)"?: string | string[];
    "Equipment Type"?: string | string[];
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
    // Future media fields (empty for now, ready for Phase 2)
    "Video URL"?: string;
    "Image URL"?: string;
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

  private transformBenchEquipment(
    originalPrimary: string | null,
    originalSecondary: string[],
    originalType: string[]
  ): { equipmentPrimary: string | null; equipmentSecondary: string[]; equipmentType: string[] } {
    // Check if this exercise uses any type of adjustable bench
    const benchTypes = [
      'Flat Bench', 'Incline Bench', 'Decline Bench',
      'Olympic Flat Bench', 'Olympic Incline Bench', 'Olympic Decline Bench'
    ];
    
    // Check primary equipment
    const primaryUsesBench = originalPrimary && benchTypes.includes(originalPrimary);
    
    // Check secondary equipment
    const secondaryBenches = originalSecondary.filter(item => benchTypes.includes(item));
    
    if (primaryUsesBench || secondaryBenches.length > 0) {
      // Transform to unified Adjustable Bench system
      let newPrimary = originalPrimary;
      let newSecondary = [...originalSecondary];
      let newType = [...originalType];
      
      // If primary equipment is a bench type, keep it as the weights/resistance
      if (primaryUsesBench) {
        // For exercises like "Flat Bench Press" where bench is primary,
        // we need to determine what's actually being lifted
        if (originalPrimary?.includes('Olympic')) {
          newPrimary = 'Barbell'; // Olympic benches use barbells
        } else {
          // Default to dumbbells for non-Olympic bench exercises
          newPrimary = 'Dumbbells';
        }
        
        // Add the bench position to equipment type
        if (originalPrimary?.includes('Flat')) {
          newType = [...newType.filter(t => !['Flat Position', 'Incline Position', 'Decline Position'].includes(t)), 'Flat Position'];
        } else if (originalPrimary?.includes('Incline')) {
          newType = [...newType.filter(t => !['Flat Position', 'Incline Position', 'Decline Position'].includes(t)), 'Incline Position'];
        } else if (originalPrimary?.includes('Decline')) {
          newType = [...newType.filter(t => !['Flat Position', 'Incline Position', 'Decline Position'].includes(t)), 'Decline Position'];
        }
        
        // Replace bench types in secondary with Adjustable Bench
        newSecondary = newSecondary.filter(item => !benchTypes.includes(item));
        if (!newSecondary.includes('Adjustable Bench')) {
          newSecondary.push('Adjustable Bench');
        }
      } else {
        // Bench is in secondary - replace all bench types with Adjustable Bench
        newSecondary = newSecondary.filter(item => !benchTypes.includes(item));
        if (!newSecondary.includes('Adjustable Bench')) {
          newSecondary.push('Adjustable Bench');
        }
        
        // Determine position from the bench types found
        const hasFlat = secondaryBenches.some(b => b.includes('Flat'));
        const hasIncline = secondaryBenches.some(b => b.includes('Incline'));
        const hasDecline = secondaryBenches.some(b => b.includes('Decline'));
        
        if (hasFlat) {
          newType = [...newType.filter(t => !['Flat Position', 'Incline Position', 'Decline Position'].includes(t)), 'Flat Position'];
        } else if (hasIncline) {
          newType = [...newType.filter(t => !['Flat Position', 'Incline Position', 'Decline Position'].includes(t)), 'Incline Position'];
        } else if (hasDecline) {
          newType = [...newType.filter(t => !['Flat Position', 'Incline Position', 'Decline Position'].includes(t)), 'Decline Position'];
        }
      }
      
      return { 
        equipmentPrimary: newPrimary, 
        equipmentSecondary: newSecondary, 
        equipmentType: newType 
      };
    }
    
    // No bench equipment found, return original values
    return { 
      equipmentPrimary: originalPrimary, 
      equipmentSecondary: originalSecondary, 
      equipmentType: originalType 
    };
  }

  private transformRecord(record: AirtableRecord): Exercise {
    const fields = record.fields;
    
    // Process equipment data with unified bench classification
    const originalPrimary = fields["Equipment (Primary)"] || null;
    const originalSecondary = this.parseArrayField(fields["Equipment 2 (Secondary)"]);
    const originalType = this.parseArrayField(fields["Equipment Type"]);
    
    // Transform bench equipment to unified Adjustable Bench system
    const { equipmentPrimary, equipmentSecondary, equipmentType } = this.transformBenchEquipment(
      originalPrimary,
      originalSecondary, 
      originalType
    );
    
    return {
      id: record.id.hashCode(),
      name: fields["Exercise Name"] || "Unknown Exercise",
      // New comprehensive fields from your 22-field Airtable structure
      alternativeNames: fields["Alternative Names"] || null,
      primaryMuscleGroup: fields["Primary Muscle Group"] || null,
      secondaryMuscleGroup: this.parseArrayField(fields["Secondary Muscle Group"]),
      equipment: fields["Equipment"] || "bodyweight",
      equipmentPrimary,
      equipmentSecondary,
      equipmentType,
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
      
      // Media fields (will be populated in Phase 2)
      videoUrl: fields["Video URL"] || null,
      imageUrl: fields["Image URL"] || null,
      
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

  // Helper method to find records by name
  private async findRecordsByNames(names: string[]): Promise<{ id: string, name: string }[]> {
    try {
      // Create OR filter for multiple names
      const nameFilters = names.map(name => `{Exercise Name} = "${name}"`).join(',');
      const filterFormula = `OR(${nameFilters})`;
      
      const url = new URL(`${this.baseUrl}/tbl18qgnmJIyf3Cu9`);
      url.searchParams.set('filterByFormula', filterFormula);
      
      const response = await fetch(url.toString(), {
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Airtable search error: ${response.status}`);
      }

      const data = await response.json();
      return data.records.map((record: any) => ({
        id: record.id,
        name: record.fields['Exercise Name']
      }));
    } catch (error) {
      console.error('Error searching exercises by names:', error);
      throw error;
    }
  }

  // Public method to delete exercises by names
  async deleteExercisesByNames(names: string[]): Promise<{ deleted: number, notFound: string[] }> {
    try {
      console.log(`🗑️ Searching for exercises to delete: ${names.join(', ')}`);
      
      const records = await this.findRecordsByNames(names);
      
      if (records.length === 0) {
        console.log('No matching records found to delete');
        return { deleted: 0, notFound: names };
      }

      console.log(`Found ${records.length} records to delete:`, records.map(r => r.name));
      
      // Delete records using batch delete
      const recordIds = records.map(r => r.id);
      const deleteParams = recordIds.map(id => `records[]=${id}`).join('&');
      
      const deleteResponse = await fetch(`${this.baseUrl}/tbl18qgnmJIyf3Cu9?${deleteParams}`, {
        method: 'DELETE',
        headers: this.headers
      });

      if (!deleteResponse.ok) {
        throw new Error(`Airtable delete error: ${deleteResponse.status}`);
      }

      const deleteData = await deleteResponse.json();
      const deletedCount = deleteData.records?.length || 0;
      
      console.log(`✅ Successfully deleted ${deletedCount} records`);
      
      const foundNames = records.map(r => r.name);
      const notFound = names.filter(name => !foundNames.includes(name));
      
      return { deleted: deletedCount, notFound };
    } catch (error) {
      console.error('Error deleting exercises:', error);
      throw error;
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