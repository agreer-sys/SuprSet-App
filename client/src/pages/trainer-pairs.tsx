import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, Plus, CheckCircle, XCircle, Edit, Trash2, 
  Filter, ArrowRight, Dumbbell, Target, LogIn, Home, Menu
} from "lucide-react";
import { Link } from "wouter";
import type { Exercise } from "@shared/schema";

interface TrainerPairing {
  id: number;
  exerciseAId: number;
  exerciseBId: number;
  exerciseA: Exercise;
  exerciseB: Exercise;
  compatibilityScore: number;
  reasoning: string[];
  trainerApproved: boolean;
  pairingType?: string;
  notes?: string;
  approvedBy?: string;
  createdAt: string;
}

export default function TrainerPairs() {
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [selectedExerciseA, setSelectedExerciseA] = useState<Exercise | null>(null);
  const [selectedExerciseB, setSelectedExerciseB] = useState<Exercise | null>(null);
  const [pairingType, setPairingType] = useState("");
  const [notes, setNotes] = useState("");
  const [filterApproved, setFilterApproved] = useState<boolean | null>(null);
  const [editingPairing, setEditingPairing] = useState<TrainerPairing | null>(null);
  const [filterPairingType, setFilterPairingType] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "score">("newest");
  
  // Advanced filtering for exercise selection
  const [categoryFilterA, setCategoryFilterA] = useState("");
  const [equipmentFilterA, setEquipmentFilterA] = useState("");
  const [muscleGroupFilterA, setMuscleGroupFilterA] = useState("");
  const [categoryFilterB, setCategoryFilterB] = useState("");
  const [equipmentFilterB, setEquipmentFilterB] = useState("");
  const [muscleGroupFilterB, setMuscleGroupFilterB] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  // For now, skip authentication to get the system working

  // Get all exercises for selection
  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  // Get filter options
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['/api/exercises/categories'],
  });

  const { data: equipment = [] } = useQuery<string[]>({
    queryKey: ['/api/exercises/equipment'],
  });

  const { data: muscleGroups = [] } = useQuery<string[]>({
    queryKey: ['/api/exercises/muscle-groups'],
  });

  // Get trainer pairings
  const { data: pairings = [], isLoading } = useQuery<TrainerPairing[]>({
    queryKey: ['/api/trainer-pairs'],
  });

  // Create pairing mutation
  const createPairingMutation = useMutation({
    mutationFn: async (pairingData: {
      exerciseAId: number;
      exerciseBId: number;
      pairingType: string;
      notes?: string;
      trainerApproved: boolean;
    }) => {
      return await apiRequest('/api/trainer-pairs', 'POST', pairingData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trainer-pairs'] });
      toast({
        title: "Success",
        description: "Trainer pairing created successfully",
      });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create pairing",
        variant: "destructive",
      });
    }
  });

  // Update pairing mutation
  const updatePairingMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number, updates: Partial<TrainerPairing> }) => {
      return await apiRequest(`/api/trainer-pairs/${id}`, 'PATCH', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trainer-pairs'] });
      toast({
        title: "Success",
        description: "Trainer pairing updated successfully",
      });
      setEditingPairing(null);
    }
  });

  // Delete pairing mutation
  const deletePairingMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/trainer-pairs/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trainer-pairs'] });
      toast({
        title: "Success",
        description: "Trainer pairing deleted successfully",
      });
    }
  });

  // Enhanced exercise filtering for Exercise A
  const filteredExercisesA = exercises.filter(e => {
    // Search term filter
    if (searchA && !e.name.toLowerCase().includes(searchA.toLowerCase())) return false;
    
    // Category filter
    if (categoryFilterA && categoryFilterA !== "all_categories" && e.exerciseType !== categoryFilterA) return false;
    
    // Equipment filter  
    if (equipmentFilterA && equipmentFilterA !== "all_equipment" && !e.equipment.toLowerCase().includes(equipmentFilterA.toLowerCase())) return false;
    
    // Muscle group filter
    if (muscleGroupFilterA && muscleGroupFilterA !== "all_muscles" && e.primaryMuscleGroup !== muscleGroupFilterA) return false;
    
    return true;
  }).slice(0, 12);

  // Enhanced exercise filtering for Exercise B
  const filteredExercisesB = exercises.filter(e => {
    // Exclude selected Exercise A
    if (selectedExerciseA && e.id === selectedExerciseA.id) return false;
    
    // Search term filter
    if (searchB && !e.name.toLowerCase().includes(searchB.toLowerCase())) return false;
    
    // Category filter
    if (categoryFilterB && categoryFilterB !== "all_categories" && e.exerciseType !== categoryFilterB) return false;
    
    // Equipment filter
    if (equipmentFilterB && equipmentFilterB !== "all_equipment" && !e.equipment.toLowerCase().includes(equipmentFilterB.toLowerCase())) return false;
    
    // Muscle group filter
    if (muscleGroupFilterB && muscleGroupFilterB !== "all_muscles" && e.primaryMuscleGroup !== muscleGroupFilterB) return false;
    
    return true;
  }).slice(0, 12);

  // Enhanced filtering and sorting
  const filteredPairings = pairings
    .filter(pairing => {
      if (filterApproved !== null && pairing.trainerApproved !== filterApproved) return false;
      if (filterPairingType && pairing.pairingType !== filterPairingType) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "score": return b.compatibilityScore - a.compatibilityScore;
        default: return 0;
      }
    });
    
  // Get unique pairing types for filter
  const pairingTypes = Array.from(new Set(pairings.map(p => p.pairingType).filter((type): type is string => Boolean(type))));
  
  // Analytics stats
  const stats = {
    total: pairings.length,
    approved: pairings.filter(p => p.trainerApproved).length,
    byType: pairingTypes.reduce((acc, type) => {
      acc[type] = pairings.filter(p => p.pairingType === type).length;
      return acc;
    }, {} as Record<string, number>),
    avgScore: pairings.length > 0 ? (pairings.reduce((sum, p) => sum + p.compatibilityScore, 0) / pairings.length).toFixed(1) : "0"
  };

  const resetForm = () => {
    setSelectedExerciseA(null);
    setSelectedExerciseB(null);
    setPairingType("");
    setNotes("");
    setSearchA("");
    setSearchB("");
    // Reset advanced filters
    setCategoryFilterA("");
    setEquipmentFilterA("");
    setMuscleGroupFilterA("");
    setCategoryFilterB("");
    setEquipmentFilterB("");
    setMuscleGroupFilterB("");
  };
  
  const clearFiltersA = () => {
    setSearchA("");
    setCategoryFilterA("");
    setEquipmentFilterA("");
    setMuscleGroupFilterA("");
  };
  
  const clearFiltersB = () => {
    setSearchB("");
    setCategoryFilterB("");
    setEquipmentFilterB("");
    setMuscleGroupFilterB("");
  };

  const handleCreatePairing = () => {
    if (!selectedExerciseA || !selectedExerciseB || !pairingType) {
      toast({
        title: "Missing Information",
        description: "Please select both exercises and a pairing type",
        variant: "destructive",
      });
      return;
    }

    createPairingMutation.mutate({
      exerciseAId: selectedExerciseA.id,
      exerciseBId: selectedExerciseB.id,
      pairingType,
      notes,
      trainerApproved: true
    });
  };

  const toggleApproval = (pairing: TrainerPairing) => {
    updatePairingMutation.mutate({
      id: pairing.id,
      updates: { trainerApproved: !pairing.trainerApproved }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Dumbbell className="text-primary-foreground w-4 h-4" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">SuprSet</h1>
            </div>
            
            <nav className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Home
                </Button>
              </Link>
              <Link href="/supersets">
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Super Sets
                </Button>
              </Link>
            </nav>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-0 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Trainer-Approved Exercise Pairs</h1>
          <p className="text-muted-foreground">
            Manage the curated list of professional exercise pairings for Trainer Mode recommendations
          </p>
        </div>

        {/* Create New Pairing */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Trainer Pairing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Exercise A Selection */}
            <div className="space-y-3">
              <Label>First Exercise</Label>
              
              {/* Advanced Filters for Exercise A */}
              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Select value={categoryFilterA || "all_categories"} onValueChange={(value) => setCategoryFilterA(value === "all_categories" ? "" : value)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_categories">All Categories</SelectItem>
                      {categories.map(category => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={equipmentFilterA || "all_equipment"} onValueChange={(value) => setEquipmentFilterA(value === "all_equipment" ? "" : value)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_equipment">All Equipment</SelectItem>
                      {equipment.map(eq => (
                        <SelectItem key={eq} value={eq}>{eq}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={muscleGroupFilterA || "all_muscles"} onValueChange={(value) => setMuscleGroupFilterA(value === "all_muscles" ? "" : value)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Muscle Group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_muscles">All Muscles</SelectItem>
                      {muscleGroups.map(muscle => (
                        <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFiltersA} className="text-xs px-2">
                  Clear
                </Button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search for first exercise..."
                  value={searchA}
                  onChange={(e) => setSearchA(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {selectedExerciseA ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{selectedExerciseA.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedExerciseA.equipment} • {selectedExerciseA.primaryMuscleGroup}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedExerciseA(null)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {filteredExercisesA.map(exercise => (
                    <Button
                      key={exercise.id}
                      variant="outline"
                      className="w-full justify-start h-auto p-3"
                      onClick={() => {
                        setSelectedExerciseA(exercise);
                        setSearchA("");
                      }}
                    >
                      <div className="text-left">
                        <p className="font-medium">{exercise.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {exercise.equipment} • {exercise.primaryMuscleGroup}
                        </p>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Exercise B Selection */}
            <div className="space-y-3">
              <Label>Second Exercise</Label>
              
              {/* Advanced Filters for Exercise B */}
              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Select value={categoryFilterB || "all_categories"} onValueChange={(value) => setCategoryFilterB(value === "all_categories" ? "" : value)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_categories">All Categories</SelectItem>
                      {categories.map(category => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={equipmentFilterB || "all_equipment"} onValueChange={(value) => setEquipmentFilterB(value === "all_equipment" ? "" : value)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_equipment">All Equipment</SelectItem>
                      {equipment.map(eq => (
                        <SelectItem key={eq} value={eq}>{eq}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={muscleGroupFilterB || "all_muscles"} onValueChange={(value) => setMuscleGroupFilterB(value === "all_muscles" ? "" : value)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Muscle Group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_muscles">All Muscles</SelectItem>
                      {muscleGroups.map(muscle => (
                        <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="sm" onClick={clearFiltersB} className="text-xs px-2">
                  Clear
                </Button>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search for second exercise..."
                  value={searchB}
                  onChange={(e) => setSearchB(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {selectedExerciseB ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{selectedExerciseB.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedExerciseB.equipment} • {selectedExerciseB.primaryMuscleGroup}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedExerciseB(null)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {filteredExercisesB.map(exercise => (
                    <Button
                      key={exercise.id}
                      variant="outline"
                      className="w-full justify-start h-auto p-3"
                      onClick={() => {
                        setSelectedExerciseB(exercise);
                        setSearchB("");
                      }}
                    >
                      <div className="text-left">
                        <p className="font-medium">{exercise.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {exercise.equipment} • {exercise.primaryMuscleGroup}
                        </p>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pairing Configuration */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pairing Type</Label>
              <Select value={pairingType} onValueChange={setPairingType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pairing type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="push_pull">Push/Pull Antagonist</SelectItem>
                  <SelectItem value="squat_hinge">Squat/Hinge Antagonist</SelectItem>
                  <SelectItem value="upper_lower">Upper/Lower Split</SelectItem>
                  <SelectItem value="compound_isolation">Compound + Isolation</SelectItem>
                  <SelectItem value="same_equipment">Same Equipment</SelectItem>
                  <SelectItem value="time_efficient">Time Efficient</SelectItem>
                  <SelectItem value="custom">Custom Pairing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Why is this a good pairing?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <Button 
            onClick={handleCreatePairing}
            disabled={createPairingMutation.isPending || !selectedExerciseA || !selectedExerciseB || !pairingType}
            className="w-full"
          >
            {createPairingMutation.isPending ? "Creating..." : "Create Trainer Pairing"}
          </Button>
        </CardContent>
      </Card>

      {/* Analytics Stats */}
      {pairings.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Trainer Pairs Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Pairs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
                <div className="text-sm text-muted-foreground">Approved</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.total - stats.approved}</div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.avgScore}</div>
                <div className="text-sm text-muted-foreground">Avg Score</div>
              </div>
            </div>
            
            {Object.keys(stats.byType).length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm font-medium mb-2">By Pairing Type:</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.byType).map(([type, count]) => (
                    <Badge key={type} variant="outline" className="text-xs">
                      {type}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Existing Pairings */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Existing Trainer Pairings ({filteredPairings.length})</CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              {/* Approval Filter */}
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4" />
                <Select 
                  value={filterApproved === null ? "all" : filterApproved.toString()} 
                  onValueChange={(value) => setFilterApproved(value === "all" ? null : value === "true")}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Approved</SelectItem>
                    <SelectItem value="false">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Type Filter */}
              {pairingTypes.length > 0 && (
                <Select 
                  value={filterPairingType || "all_types"} 
                  onValueChange={(value) => setFilterPairingType(value === "all_types" ? "" : value)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_types">All Types</SelectItem>
                    {pairingTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Sort Filter */}
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="score">Best Score</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading pairings...</div>
          ) : filteredPairings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No trainer pairings found. Create your first pairing above.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPairings.map((pairing) => (
                <div 
                  key={pairing.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{pairing.exerciseA?.name || `Exercise ${pairing.exerciseAId}`}</Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <Badge variant="outline">{pairing.exerciseB?.name || `Exercise ${pairing.exerciseBId}`}</Badge>
                      </div>
                      <Badge variant={pairing.trainerApproved ? "default" : "secondary"}>
                        {pairing.trainerApproved ? "Approved" : "Pending"}
                      </Badge>
                      {pairing.pairingType && (
                        <Badge variant="outline">{pairing.pairingType}</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant={pairing.trainerApproved ? "outline" : "default"}
                        size="sm"
                        onClick={() => toggleApproval(pairing)}
                        disabled={updatePairingMutation.isPending}
                      >
                        {pairing.trainerApproved ? (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Unapprove
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePairingMutation.mutate(pairing.id)}
                        disabled={deletePairingMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {pairing.notes && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {pairing.notes}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Score: {pairing.compatibilityScore}</span>
                    <span>{new Date(pairing.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}