// Spatial mapping and gym layout logic
import type { DetectedEquipment, DetectedPose } from '../pages/gym-mapping';

export interface SpatialPoint {
  x: number;
  y: number;
  z?: number;
}

export interface EquipmentZone {
  id: string;
  name: string;
  equipment: DetectedEquipment[];
  center: SpatialPoint;
  radius: number;
  type: 'cardio' | 'strength' | 'free_weights' | 'functional' | 'stretching';
}

export interface GymLayout {
  id: string;
  name: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  equipment: DetectedEquipment[];
  zones: EquipmentZone[];
  dimensions: {
    width: number;
    height: number;
    area?: number;
  };
  crowdingLevel: 'low' | 'medium' | 'high';
  lastUpdated: number;
  contributors: number;
}

export class SpatialMapper {
  
  // Analyze equipment distribution and create logical zones
  createEquipmentZones(equipment: DetectedEquipment[]): EquipmentZone[] {
    const zones: EquipmentZone[] = [];
    
    // Group equipment by type and proximity
    const cardioEquipment = equipment.filter(eq => 
      ['Treadmill', 'Exercise Bike', 'Elliptical', 'Rowing Machine'].includes(eq.name)
    );
    
    const strengthEquipment = equipment.filter(eq => 
      ['Chest Press Machine', 'Leg Press Machine', 'Lat Pulldown Machine', 'Smith Machine'].includes(eq.name)
    );
    
    const freeWeightEquipment = equipment.filter(eq => 
      ['Dumbbell', 'Barbell', 'Squat Rack', 'Flat Bench'].includes(eq.name)
    );

    // Create zones based on equipment clusters
    if (cardioEquipment.length > 0) {
      zones.push(this.createZone('cardio', cardioEquipment));
    }
    
    if (strengthEquipment.length > 0) {
      zones.push(this.createZone('strength', strengthEquipment));
    }
    
    if (freeWeightEquipment.length > 0) {
      zones.push(this.createZone('free_weights', freeWeightEquipment));
    }

    return zones;
  }

  private createZone(type: EquipmentZone['type'], equipment: DetectedEquipment[]): EquipmentZone {
    // Calculate center point of equipment cluster
    const avgX = equipment.reduce((sum, eq) => sum + eq.position.x, 0) / equipment.length;
    const avgY = equipment.reduce((sum, eq) => sum + eq.position.y, 0) / equipment.length;
    
    // Calculate radius based on equipment spread
    const maxDistance = Math.max(
      ...equipment.map(eq => 
        Math.sqrt(Math.pow(eq.position.x - avgX, 2) + Math.pow(eq.position.y - avgY, 2))
      )
    );

    return {
      id: `zone_${type}_${Date.now()}`,
      name: this.getZoneName(type),
      equipment,
      center: { x: avgX, y: avgY },
      radius: Math.max(maxDistance + 10, 15), // Minimum 15% radius
      type
    };
  }

  private getZoneName(type: EquipmentZone['type']): string {
    const names = {
      cardio: 'Cardio Zone',
      strength: 'Machine Zone', 
      free_weights: 'Free Weight Zone',
      functional: 'Functional Training Zone',
      stretching: 'Stretching Area'
    };
    return names[type];
  }

  // Calculate optimal workout flow between equipment
  calculateOptimalPath(exerciseA: string, exerciseB: string, layout: GymLayout): {
    path: SpatialPoint[];
    distance: number;
    estimatedTime: number;
  } {
    const equipmentA = layout.equipment.find(eq => eq.name.includes(exerciseA));
    const equipmentB = layout.equipment.find(eq => eq.name.includes(exerciseB));
    
    if (!equipmentA || !equipmentB) {
      return {
        path: [],
        distance: 0,
        estimatedTime: 0
      };
    }

    // Simple straight-line path for now (can be enhanced with obstacle avoidance)
    const path = [
      { x: equipmentA.position.x, y: equipmentA.position.y },
      { x: equipmentB.position.x, y: equipmentB.position.y }
    ];

    const distance = Math.sqrt(
      Math.pow(equipmentB.position.x - equipmentA.position.x, 2) + 
      Math.pow(equipmentB.position.y - equipmentA.position.y, 2)
    );

    // Estimate walking time (assuming 3 feet per second average gym walking speed)
    const estimatedTime = (distance / 100) * 20; // seconds (rough conversion)

    return { path, distance, estimatedTime };
  }

  // Analyze crowd levels using pose detection
  analyzeCrowdLevel(poses: DetectedPose[], equipment: DetectedEquipment[]): 'low' | 'medium' | 'high' {
    const personCount = poses.length;
    const equipmentCount = equipment.length;
    
    if (equipmentCount === 0) return 'low';
    
    const crowdRatio = personCount / equipmentCount;
    
    if (crowdRatio < 0.3) return 'low';
    if (crowdRatio < 0.7) return 'medium';
    return 'high';
  }

  // Generate superset recommendations based on spatial layout
  recommendSupersetsByProximity(layout: GymLayout, exerciseType: string): Array<{
    exerciseA: string;
    exerciseB: string;
    distance: number;
    zone: string;
  }> {
    const recommendations: Array<{
      exerciseA: string;
      exerciseB: string;
      distance: number;
      zone: string;
    }> = [];

    // Find equipment pairs within same zone or nearby zones
    layout.zones.forEach(zone => {
      const zoneEquipment = zone.equipment;
      
      for (let i = 0; i < zoneEquipment.length; i++) {
        for (let j = i + 1; j < zoneEquipment.length; j++) {
          const equipA = zoneEquipment[i];
          const equipB = zoneEquipment[j];
          
          const distance = Math.sqrt(
            Math.pow(equipB.position.x - equipA.position.x, 2) + 
            Math.pow(equipB.position.y - equipA.position.y, 2)
          );

          // Only recommend if equipment is reasonably close (within 25% of gym)
          if (distance < 25) {
            recommendations.push({
              exerciseA: equipA.name,
              exerciseB: equipB.name,
              distance,
              zone: zone.name
            });
          }
        }
      }
    });

    // Sort by proximity (closest first)
    return recommendations.sort((a, b) => a.distance - b.distance);
  }
}

export const spatialMapper = new SpatialMapper();