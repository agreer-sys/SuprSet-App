import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Dumbbell, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Exercise } from "@shared/schema";

interface ExerciseSelectionProps {
  selectedExercise: Exercise | null;
  onExerciseSelect: (exercise: Exercise) => void;
  onShowInstructions: (exercise: Exercise) => void;
}

export default function ExerciseSelection({ 
  selectedExercise, 
  onExerciseSelect, 
  onShowInstructions 
}: ExerciseSelectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Exercise Type");
  const [equipmentFilter, setEquipmentFilter] = useState("All Equipment");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<Exercise[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get all exercises for autocomplete
  const { data: allExercises = [] } = useQuery<Exercise[]>({
    queryKey: ["/api/exercises"],
  });

  // Get dynamic categories and equipment from your Airtable data
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/exercises/categories"],
  });

  const { data: equipmentTypes = [] } = useQuery<string[]>({
    queryKey: ["/api/exercises/equipment"],
  });

  const { data: exercises = [], isLoading } = useQuery<Exercise[]>({
    queryKey: ["/api/exercises/search", { q: searchQuery, category: categoryFilter, equipment: equipmentFilter }],
    enabled: true,
  });

  // Autocomplete logic
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const filtered = allExercises
        .filter(exercise => 
          exercise.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          exercise.primaryMuscleGroup?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          exercise.equipment.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 5); // Show top 5 suggestions
      setAutocompleteSuggestions(filtered);
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
      setAutocompleteSuggestions([]);
    }
  }, [searchQuery, allExercises]);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAutocompleteSelect = (exercise: Exercise) => {
    setSearchQuery(exercise.name);
    setShowAutocomplete(false);
    onExerciseSelect(exercise);
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      push: "bg-blue-100 text-blue-700",
      pull: "bg-purple-100 text-purple-700", 
      legs: "bg-green-100 text-green-700",
      core: "bg-orange-100 text-orange-700",
      compound: "bg-red-100 text-red-700"
    };
    return colors[category] || "bg-gray-100 text-gray-700";
  };

  const getDifficultyStars = (difficulty: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i} 
        className={`w-3 h-3 ${i < difficulty ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
      />
    ));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Select First Exercise</CardTitle>
          <Badge variant="secondary">(A)</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="relative" ref={searchInputRef}>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input 
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowAutocomplete(true)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setShowAutocomplete(false);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            
            {/* Autocomplete Dropdown */}
            {showAutocomplete && autocompleteSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {autocompleteSuggestions.map((exercise) => (
                  <div
                    key={exercise.id}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    onClick={() => handleAutocompleteSelect(exercise)}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                        <Dumbbell className="w-4 h-4 text-gray-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{exercise.name}</div>
                        <div className="text-sm text-gray-500">
                          {exercise.primaryMuscleGroup} • {exercise.equipment}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex space-x-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Exercise Type">Exercise Type</SelectItem>
                {categories.map((category: string) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Equipment">All Equipment</SelectItem>
                {equipmentTypes.map((equipment: string) => (
                  <SelectItem key={equipment} value={equipment}>
                    {equipment}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Exercise List */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading exercises...</div>
          ) : exercises.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No exercises found</div>
          ) : (
            exercises.map((exercise: Exercise) => (
              <div 
                key={exercise.id}
                className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:border-primary-300 hover:bg-primary-50 ${
                  selectedExercise?.id === exercise.id 
                    ? 'border-primary bg-primary-50' 
                    : 'border-gray-200'
                }`}
                onClick={() => onExerciseSelect(exercise)}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
                    <Dumbbell className="text-gray-400 w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{exercise.name}</h3>
                    <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                      <Badge className={getCategoryColor(exercise.category)} variant="secondary">
                        {exercise.category}
                      </Badge>
                      <span className="truncate">{exercise.equipment}</span>
                      <div className="flex items-center space-x-1">
                        {getDifficultyStars(exercise.difficulty)}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowInstructions(exercise);
                    }}
                    className="text-primary hover:text-primary-600"
                  >
                    Info
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
