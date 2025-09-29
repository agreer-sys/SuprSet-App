import { seedWorkouts } from './workout-seeds.js';

async function runSeed() {
  try {
    console.log('🌱 Starting workout template seeding process...');
    await seedWorkouts();
    console.log('🎉 Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  }
}

runSeed();