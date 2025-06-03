import { X, Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Exercise } from "@shared/schema";

interface ExerciseModalProps {
  exercise: Exercise;
  onClose: () => void;
}

export default function ExerciseModal({ exercise, onClose }: ExerciseModalProps) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            {exercise.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Exercise demonstration placeholder */}
          <div className="bg-gray-200 rounded-lg h-64 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Play className="w-12 h-12 mx-auto mb-2" />
              <p>Exercise Demonstration Video</p>
              <p className="text-sm text-gray-400 mt-1">Video content would be loaded here</p>
            </div>
          </div>

          {/* Exercise Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Category</h4>
              <Badge variant="secondary">{exercise.category}</Badge>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Equipment</h4>
              <p className="text-gray-600 capitalize">{exercise.equipment}</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Difficulty</h4>
              <p className="text-gray-600">{exercise.difficulty}/5</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Movement Pattern</h4>
              <p className="text-gray-600 capitalize">{exercise.movementPattern.replace("_", " ")}</p>
            </div>
          </div>

          {/* Muscle Groups */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Primary Muscles</h4>
            <div className="flex flex-wrap gap-2">
              {exercise.primaryMuscles.map((muscle) => (
                <Badge key={muscle} variant="outline" className="capitalize">
                  {muscle}
                </Badge>
              ))}
            </div>
          </div>

          {exercise.secondaryMuscles.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Secondary Muscles</h4>
              <div className="flex flex-wrap gap-2">
                {exercise.secondaryMuscles.map((muscle) => (
                  <Badge key={muscle} variant="outline" className="capitalize text-gray-500">
                    {muscle}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Instructions */}
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Setup</h3>
              <p className="text-gray-600">{exercise.instructions.setup}</p>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Execution</h3>
              <ul className="text-gray-600 space-y-1">
                {exercise.instructions.execution.map((step, index) => (
                  <li key={index}>• {step}</li>
                ))}
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Safety Tips</h3>
              <Card className="bg-yellow-50 border-yellow-200 p-3">
                <ul className="text-yellow-800 text-sm space-y-1">
                  {exercise.instructions.safetyTips.map((tip, index) => (
                    <li key={index}>• {tip}</li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button className="flex-1">
              Start Exercise
            </Button>
            <Button variant="outline" className="flex-1">
              Add to Favorites
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
