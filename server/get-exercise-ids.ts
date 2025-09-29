import { storage } from './storage.js';

async function getExerciseIds() {
  try {
    console.log('Fetching exercises from Airtable...');
    await storage.refreshCache();
    const exercises = await storage.getAllExercises();
    
    console.log('Available exercises for seed data:');
    console.log('='.repeat(50));
    
    // Show first 40 exercises with their IDs and basic info
    exercises.slice(0, 40).forEach((ex, index) => {
      console.log(`ID: ${ex.id} | ${ex.name} | ${ex.category} | ${ex.muscleGroup}`);
    });
    
    console.log('='.repeat(50));
    console.log(`Total exercises available: ${exercises.length}`);
    
    // Find some common exercises for our workout templates
    const commonExercises = [
      'Bench Press', 'Push-up', 'Squat', 'Deadlift', 'Pull-up', 
      'Overhead Press', 'Barbell Row', 'Treadmill', 'Burpee', 'Mountain Climber'
    ];
    
    console.log('\nLooking for common exercises:');
    commonExercises.forEach(exerciseName => {
      const found = exercises.find(ex => 
        ex.name.toLowerCase().includes(exerciseName.toLowerCase())
      );
      if (found) {
        console.log(`✅ ${exerciseName}: ID ${found.id} (${found.name})`);
      } else {
        console.log(`❌ ${exerciseName}: Not found`);
      }
    });
    
  } catch (error) {
    console.error('Error fetching exercise data:', error);
  }
}

getExerciseIds();