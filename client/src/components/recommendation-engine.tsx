import { useQuery } from "@tanstack/react-query";
import { Dumbbell, X, RefreshCw, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Exercise } from "@shared/schema";

interface RecommendationEngineProps {
  selectedExercise: Exercise | null;
  selectedPair: { exerciseA: Exercise; exerciseB: Exercise } | null;
  onPairSelect: (exerciseB: Exercise) => void;
  onShowInstructions: (exercise: Exercise) => void;
  onClearSelection: () => void;
}

interface Recommendation {
  exercise: Exercise;
  compatibilityScore: number;
  reasoning: string[];
}

export default function RecommendationEngine({ 
  selectedExercise, 
  selectedPair, 
  onPairSelect, 
  onShowInstructions,
  onClearSelection 
}: RecommendationEngineProps) {
  const { data: recommendationsData, isLoading } = useQuery({
    queryKey: ["/api/exercises", selectedExercise?.id, "recommendations"],
    enabled: !!selectedExercise,
  });

  const recommendations: Recommendation[] = recommendationsData?.recommendations || [];
  const topRecommendation = recommendations[0];
  const alternativeRecommendations = recommendations.slice(1, 4);

  if (!selectedExercise) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-gray-500">
            <Dumbbell className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium mb-2">Select an Exercise</h3>
            <p className="text-sm">Choose your first exercise to see smart pairing recommendations</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selected Exercise Display */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Current Selection</CardTitle>
            <Badge variant="secondary">Exercise A</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="w-16 h-16 bg-primary/20 rounded-lg flex items-center justify-center">
              <Dumbbell className="text-primary w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">{selectedExercise.name}</h3>
              <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                <span>Primary: {selectedExercise.primaryMuscles.join(", ")}</span>
                <span>•</span>
                <span>Pattern: {selectedExercise.movementPattern.replace("_", " ")}</span>
                <span>•</span>
                <span>Equipment: {selectedExercise.equipment}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClearSelection}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Smart Recommendations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Smart Recommendations</CardTitle>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">Exercise B</Badge>
              <Button 
                variant="ghost" 
                size="sm"
                disabled={isLoading}
                className="text-primary hover:text-primary-600"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              Calculating optimal pairings...
            </div>
          ) : topRecommendation ? (
            <div className="space-y-4">
              {/* Top Recommendation */}
              <div className="bg-gradient-to-r from-secondary/10 to-primary/10 border border-secondary/20 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Badge className="bg-secondary text-secondary-foreground">BEST MATCH</Badge>
                    <span className="text-secondary font-semibold">
                      {Math.round(topRecommendation.compatibilityScore)}% Compatibility
                    </span>
                  </div>
                  <Button 
                    onClick={() => onPairSelect(topRecommendation.exercise)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Select Pair
                  </Button>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center shadow-sm">
                    <Dumbbell className="text-gray-600 w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900">{topRecommendation.exercise.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                      <span>Primary: {topRecommendation.exercise.primaryMuscles.join(", ")}</span>
                      <span>•</span>
                      <span>Pattern: {topRecommendation.exercise.movementPattern.replace("_", " ")}</span>
                      <span>•</span>
                      <span>Equipment: {topRecommendation.exercise.equipment}</span>
                    </div>
                    
                    {/* Pairing Rationale */}
                    {topRecommendation.reasoning.length > 0 && (
                      <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                          <Lightbulb className="text-yellow-500 w-4 h-4 mr-1" />
                          Why This Pairing Works
                        </h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {topRecommendation.reasoning.map((reason, index) => (
                            <li key={index}>• {reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Alternative Recommendations */}
              {alternativeRecommendations.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Alternative Options
                  </h3>
                  
                  {alternativeRecommendations.map((rec) => (
                    <div 
                      key={rec.exercise.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:bg-gray-50 cursor-pointer transition-all duration-200"
                      onClick={() => onPairSelect(rec.exercise)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                            <Dumbbell className="text-gray-400 w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{rec.exercise.name}</h4>
                            <p className="text-sm text-gray-500">
                              {rec.exercise.equipment} • {rec.exercise.movementPattern.replace("_", " ")} • {Math.round(rec.compatibilityScore)}% match
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {rec.reasoning.join(" | ")}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-secondary">
                            {Math.round(rec.compatibilityScore)}%
                          </div>
                          <Button 
                            variant="link" 
                            size="sm"
                            className="text-xs text-primary hover:text-primary-600 p-0 h-auto"
                          >
                            Select
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No recommendations available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
