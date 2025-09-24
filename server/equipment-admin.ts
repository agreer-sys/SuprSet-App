/**
 * EQUIPMENT ADMIN UTILITIES
 * 
 * Administrative functions for managing the equipment catalog.
 * Can be used for bulk updates, migrations, and maintenance.
 */

import { EQUIPMENT_CATALOG, EquipmentItem, addEquipment, updateEquipment, deactivateEquipment } from '../shared/equipment-catalog';

/**
 * Add equipment admin route to Express app
 */
export function setupEquipmentAdminRoutes(app: any) {
  
  // Get full equipment catalog with metadata
  app.get('/api/admin/equipment/catalog', (req: any, res: any) => {
    try {
      const stats = {
        total: EQUIPMENT_CATALOG.length,
        active: EQUIPMENT_CATALOG.filter(item => item.isActive).length,
        byCategory: {} as Record<string, number>,
        bySubcategory: {} as Record<string, number>
      };
      
      EQUIPMENT_CATALOG.forEach(item => {
        if (item.isActive) {
          stats.byCategory[item.category] = (stats.byCategory[item.category] || 0) + 1;
          if (item.subcategory) {
            stats.bySubcategory[item.subcategory] = (stats.bySubcategory[item.subcategory] || 0) + 1;
          }
        }
      });
      
      res.json({
        catalog: EQUIPMENT_CATALOG,
        stats
      });
    } catch (error) {
      console.error('Error fetching equipment catalog:', error);
      res.status(500).json({ message: 'Failed to fetch equipment catalog' });
    }
  });
  
  // Add new equipment item
  app.post('/api/admin/equipment/add', (req: any, res: any) => {
    try {
      const { name, category, subcategory, notes } = req.body;
      
      if (!name || !category) {
        return res.status(400).json({ message: 'Name and category are required' });
      }
      
      // Check if equipment already exists
      const exists = EQUIPMENT_CATALOG.find(item => item.name === name);
      if (exists) {
        return res.status(409).json({ message: 'Equipment with this name already exists' });
      }
      
      const newItem = addEquipment({
        name,
        category,
        subcategory,
        isActive: true,
        notes
      });
      
      console.log(`✅ Added new equipment: ${name} (${category}${subcategory ? ' - ' + subcategory : ''})`);
      res.json({ message: 'Equipment added successfully', equipment: newItem });
    } catch (error) {
      console.error('Error adding equipment:', error);
      res.status(500).json({ message: 'Failed to add equipment' });
    }
  });
  
  // Update equipment item
  app.put('/api/admin/equipment/:name', (req: any, res: any) => {
    try {
      const { name } = req.params;
      const updates = req.body;
      
      const success = updateEquipment(name, updates);
      if (!success) {
        return res.status(404).json({ message: 'Equipment not found' });
      }
      
      console.log(`✅ Updated equipment: ${name}`);
      res.json({ message: 'Equipment updated successfully' });
    } catch (error) {
      console.error('Error updating equipment:', error);
      res.status(500).json({ message: 'Failed to update equipment' });
    }
  });
  
  // Deactivate equipment (soft delete)
  app.delete('/api/admin/equipment/:name', (req: any, res: any) => {
    try {
      const { name } = req.params;
      
      const success = deactivateEquipment(name);
      if (!success) {
        return res.status(404).json({ message: 'Equipment not found' });
      }
      
      console.log(`❌ Deactivated equipment: ${name}`);
      res.json({ message: 'Equipment deactivated successfully' });
    } catch (error) {
      console.error('Error deactivating equipment:', error);
      res.status(500).json({ message: 'Failed to deactivate equipment' });
    }
  });
  
  // Bulk import equipment
  app.post('/api/admin/equipment/bulk-import', (req: any, res: any) => {
    try {
      const { equipment } = req.body;
      
      if (!Array.isArray(equipment)) {
        return res.status(400).json({ message: 'Equipment must be an array' });
      }
      
      const results = {
        added: 0,
        skipped: 0,
        errors: [] as string[]
      };
      
      equipment.forEach((item: Partial<EquipmentItem>) => {
        try {
          if (!item.name || !item.category) {
            results.errors.push(`Invalid item: missing name or category`);
            return;
          }
          
          const exists = EQUIPMENT_CATALOG.find(existing => existing.name === item.name);
          if (exists) {
            results.skipped++;
            return;
          }
          
          addEquipment({
            name: item.name,
            category: item.category as any,
            subcategory: item.subcategory,
            isActive: item.isActive ?? true,
            notes: item.notes
          });
          
          results.added++;
        } catch (error) {
          results.errors.push(`Failed to add ${item.name}: ${error}`);
        }
      });
      
      console.log(`📦 Bulk import completed: ${results.added} added, ${results.skipped} skipped, ${results.errors.length} errors`);
      res.json({ message: 'Bulk import completed', results });
    } catch (error) {
      console.error('Error in bulk import:', error);
      res.status(500).json({ message: 'Failed to perform bulk import' });
    }
  });
}

/**
 * Restore missing equipment from known list
 */
export async function restoreMissingEquipment() {
  console.log('🔄 Checking for missing equipment to restore...');
  
  // These are equipment items that should definitely be in the catalog
  const essentialEquipment = [
    { name: "Olympic Barbell", category: "Strength", subcategory: "Free Weights" },
    { name: "Olympic Dumbbells", category: "Strength", subcategory: "Free Weights" },
    { name: "Olympic Weight Plates", category: "Strength", subcategory: "Free Weights" },
    { name: "Plate Loaded Leg Press", category: "Strength", subcategory: "Plate Loaded" },
    { name: "Plate Loaded Chest Press", category: "Strength", subcategory: "Plate Loaded" },
    { name: "Cable Crossover Machine", category: "Strength", subcategory: "Cable Stack" },
    { name: "Selectorized (Built in weight stack)", category: "Strength", subcategory: "Selectorized" }
  ];
  
  let restored = 0;
  
  essentialEquipment.forEach(item => {
    const exists = EQUIPMENT_CATALOG.find(existing => existing.name === item.name);
    if (!exists) {
      addEquipment({
        name: item.name,
        category: item.category as any,
        subcategory: item.subcategory,
        isActive: true,
        notes: 'Restored from missing equipment'
      });
      restored++;
      console.log(`✅ Restored: ${item.name}`);
    }
  });
  
  if (restored > 0) {
    console.log(`🎉 Restored ${restored} missing equipment items`);
  } else {
    console.log('✅ No missing equipment found');
  }
  
  return restored;
}