/**
 * DEDICATED EQUIPMENT CATALOG
 * 
 * This file contains the master equipment list for SuprSet.
 * Both developers and users can easily modify this list.
 * Changes here will be reflected across all dropdowns in the app.
 */

export interface EquipmentItem {
  name: string;
  category: 'Strength' | 'Cardio' | 'Functional' | 'Accessories';
  subcategory?: string;
  isActive: boolean;
  addedDate?: string;
  notes?: string;
}

export const EQUIPMENT_CATALOG: EquipmentItem[] = [
  // STRENGTH EQUIPMENT - Free Weights
  { name: "Barbell", category: "Strength", subcategory: "Free Weights", isActive: true },
  { name: "Olympic Barbell", category: "Strength", subcategory: "Free Weights", isActive: true },
  { name: "EZ Barbell", category: "Strength", subcategory: "Free Weights", isActive: true },
  { name: "Dumbbells", category: "Strength", subcategory: "Free Weights", isActive: true },
  { name: "Olympic Dumbbells", category: "Strength", subcategory: "Free Weights", isActive: true },
  { name: "Kettlebells", category: "Strength", subcategory: "Free Weights", isActive: true },
  { name: "Olympic Plate", category: "Strength", subcategory: "Free Weights", isActive: true },
  { name: "Weight Plates", category: "Strength", subcategory: "Free Weights", isActive: true },
  { name: "Olympic Weight Plates", category: "Strength", subcategory: "Free Weights", isActive: true },

  // STRENGTH EQUIPMENT - Plate Loaded Machines
  { name: "Plate Loaded Leg Press", category: "Strength", subcategory: "Plate Loaded", isActive: true },
  { name: "Plate Loaded Chest Press", category: "Strength", subcategory: "Plate Loaded", isActive: true },
  { name: "Plate Loaded Shoulder Press", category: "Strength", subcategory: "Plate Loaded", isActive: true },
  { name: "Plate Loaded Seated Row", category: "Strength", subcategory: "Plate Loaded", isActive: true },
  { name: "Plate Loaded Lat Pulldown", category: "Strength", subcategory: "Plate Loaded", isActive: true },
  { name: "Plate Loaded Hack Squat", category: "Strength", subcategory: "Plate Loaded", isActive: true },
  { name: "Plate Loaded T-Bar Row", category: "Strength", subcategory: "Plate Loaded", isActive: true },
  { name: "Plate Loaded Incline Press", category: "Strength", subcategory: "Plate Loaded", isActive: true },
  { name: "Plate Loaded Decline Press", category: "Strength", subcategory: "Plate Loaded", isActive: true },

  // STRENGTH EQUIPMENT - Cable/Stack Machines  
  { name: "Cable Tower", category: "Strength", subcategory: "Cable Stack", isActive: true },
  { name: "Functional Trainer", category: "Strength", subcategory: "Cable Stack", isActive: true },
  { name: "Cable Crossover Machine", category: "Strength", subcategory: "Cable Stack", isActive: true },
  { name: "Lat Pulldown Machine", category: "Strength", subcategory: "Cable Stack", isActive: true },
  { name: "Seated Cable Row Machine", category: "Strength", subcategory: "Cable Stack", isActive: true },
  { name: "Cable Fly Machine", category: "Strength", subcategory: "Cable Stack", isActive: true },
  { name: "Tricep Extension Machine", category: "Strength", subcategory: "Cable Stack", isActive: true },
  { name: "Cable Lateral Raise Machine", category: "Strength", subcategory: "Cable Stack", isActive: true },

  // STRENGTH EQUIPMENT - Selectorized (Built-in Weight Stack)
  { name: "Chest Press Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Shoulder Press Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Leg Press Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Leg Extension Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Leg Curl Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Laying Leg Curl Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Standing Leg Curl Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Incline Chest Press Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Pec Fly / Rear Delt Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Machine Row", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Lateral Raise Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Reverse Fly Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Abductor Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Adductor Machine", category: "Strength", subcategory: "Selectorized", isActive: true },
  { name: "Assisted Pull-Up Machine", category: "Strength", subcategory: "Selectorized", isActive: true },

  // STRENGTH EQUIPMENT - Benches & Racks
  { name: "Adjustable Bench", category: "Strength", subcategory: "Benches", isActive: true },
  { name: "Olympic Military Bench", category: "Strength", subcategory: "Benches", isActive: true },
  { name: "Preacher Bench", category: "Strength", subcategory: "Benches", isActive: true },
  { name: "Back Extension Bench", category: "Strength", subcategory: "Benches", isActive: true },
  { name: "Rack", category: "Strength", subcategory: "Racks", isActive: true },
  { name: "Smith Machine", category: "Strength", subcategory: "Racks", isActive: true },
  { name: "Squat Rack", category: "Strength", subcategory: "Racks", isActive: true },
  { name: "Power Rack", category: "Strength", subcategory: "Racks", isActive: true },

  // STRENGTH EQUIPMENT - Specialized
  { name: "T-Bar Row Machine", category: "Strength", subcategory: "Specialized", isActive: true },
  { name: "Preacher Curl Machine", category: "Strength", subcategory: "Specialized", isActive: true },
  { name: "Roman Chair Machine", category: "Strength", subcategory: "Specialized", isActive: true },
  { name: "Glute Ham Raise Unit", category: "Strength", subcategory: "Specialized", isActive: true },
  { name: "Glute Bridge Machine", category: "Strength", subcategory: "Specialized", isActive: true },
  { name: "Glute Kickback Machine", category: "Strength", subcategory: "Specialized", isActive: true },
  { name: "Nordic Hamstring Curl Machine", category: "Strength", subcategory: "Specialized", isActive: true },
  { name: "Reverse Hyper Machine", category: "Strength", subcategory: "Specialized", isActive: true },
  { name: "Landmine Attachment", category: "Strength", subcategory: "Specialized", isActive: true },

  // CARDIO EQUIPMENT
  { name: "Treadmill", category: "Cardio", isActive: true },
  { name: "Stationary Bike", category: "Cardio", isActive: true },
  { name: "Elliptical", category: "Cardio", isActive: true },
  { name: "Rower", category: "Cardio", isActive: true },
  { name: "Ski Erg", category: "Cardio", isActive: true },
  { name: "Assault Bike", category: "Cardio", isActive: true },
  { name: "Stair Climber", category: "Cardio", isActive: true },
  { name: "Jacobs Ladder", category: "Cardio", isActive: true },

  // FUNCTIONAL EQUIPMENT
  { name: "Pull-Up Bar", category: "Functional", isActive: true },
  { name: "Dip Station", category: "Functional", isActive: true },
  { name: "TRX Unit", category: "Functional", isActive: true },
  { name: "Battle Ropes", category: "Functional", isActive: true },
  { name: "Sled", category: "Functional", isActive: true },
  { name: "Plyo Box", category: "Functional", isActive: true },
  { name: "Wall Ball Target", category: "Functional", isActive: true },

  // ACCESSORIES & ATTACHMENTS
  { name: "Straight Bar Attachment", category: "Accessories", isActive: true },
  { name: "Handle Attachment", category: "Accessories", isActive: true },
  { name: "Rope Attachment", category: "Accessories", isActive: true },
  { name: "Loop Band", category: "Accessories", isActive: true },
  { name: "Strength Band", category: "Accessories", isActive: true },
  { name: "Medicine Ball", category: "Accessories", isActive: true },
  { name: "Stability Ball", category: "Accessories", isActive: true },
  { name: "Jump Rope", category: "Accessories", isActive: true },
  { name: "Mat", category: "Accessories", isActive: true },
  { name: "Bodyweight", category: "Accessories", isActive: true },
];

/**
 * Get all active equipment names for dropdowns
 */
export function getActiveEquipmentNames(): string[] {
  return EQUIPMENT_CATALOG
    .filter(item => item.isActive)
    .map(item => item.name)
    .sort();
}

/**
 * Get equipment by category
 */
export function getEquipmentByCategory(category: string): EquipmentItem[] {
  return EQUIPMENT_CATALOG.filter(item => 
    item.isActive && item.category === category
  );
}

/**
 * Get equipment by subcategory
 */
export function getEquipmentBySubcategory(subcategory: string): EquipmentItem[] {
  return EQUIPMENT_CATALOG.filter(item => 
    item.isActive && item.subcategory === subcategory
  );
}

/**
 * Add new equipment item
 */
export function addEquipment(equipment: Omit<EquipmentItem, 'addedDate'>): EquipmentItem {
  const newItem: EquipmentItem = {
    ...equipment,
    addedDate: new Date().toISOString().split('T')[0]
  };
  EQUIPMENT_CATALOG.push(newItem);
  return newItem;
}

/**
 * Update equipment item
 */
export function updateEquipment(name: string, updates: Partial<EquipmentItem>): boolean {
  const index = EQUIPMENT_CATALOG.findIndex(item => item.name === name);
  if (index === -1) return false;
  
  EQUIPMENT_CATALOG[index] = { ...EQUIPMENT_CATALOG[index], ...updates };
  return true;
}

/**
 * Deactivate equipment (soft delete)
 */
export function deactivateEquipment(name: string): boolean {
  return updateEquipment(name, { isActive: false });
}