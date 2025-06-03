import { useState } from "react";
import Header from "@/components/header";
import ExerciseSelection from "@/components/exercise-selection";
import RecommendationEngine from "@/components/recommendation-engine";
import WorkoutTimer from "@/components/workout-timer";
import ExerciseModal from "@/components/exercise-modal";
import type { Exercise } from "@shared/schema";

export default function Home() {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ exerciseA: Exercise; exerciseB: Exercise } | null>(null);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [modalExercise, setModalExercise] = useState<Exercise | null>(null);

  const handleExerciseSelect = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setSelectedPair(null);
  };

  const handlePairSelect = (exerciseB: Exercise) => {
    if (selectedExercise) {
      setSelectedPair({ exerciseA: selectedExercise, exerciseB });
    }
  };

  const handleShowInstructions = (exercise: Exercise) => {
    setModalExercise(exercise);
    setShowExerciseModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Exercise Selection Panel */}
          <div className="lg:col-span-1">
            <ExerciseSelection 
              selectedExercise={selectedExercise}
              onExerciseSelect={handleExerciseSelect}
              onShowInstructions={handleShowInstructions}
            />
          </div>
          
          {/* Recommendation Engine */}
          <div className="lg:col-span-2 space-y-6">
            <RecommendationEngine 
              selectedExercise={selectedExercise}
              selectedPair={selectedPair}
              onPairSelect={handlePairSelect}
              onShowInstructions={handleShowInstructions}
              onClearSelection={() => setSelectedExercise(null)}
            />
            
            {selectedPair && (
              <WorkoutTimer selectedPair={selectedPair} />
            )}
          </div>
        </div>
      </div>

      {showExerciseModal && modalExercise && (
        <ExerciseModal 
          exercise={modalExercise}
          onClose={() => setShowExerciseModal(false)}
        />
      )}
    </div>
  );
}
