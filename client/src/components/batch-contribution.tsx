import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trash2, Upload, Camera, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BatchImage {
  id: string;
  file: File;
  preview: string;
  equipment: string;
  confidence: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
}

const EQUIPMENT_PRESETS = [
  "Abductor Machine", "Adductor Machine", "Adjustable Bench", "Assault Bike", "Assisted Pull-Up Machine",
  "Back Extension Bench", "Barbell", "Bodyweight", "Cable Tower", "Calf Raise Machine (Cable Stack)",
  "Calf Raise Machine (Plate Loaded)", "Chest Press Machine (Cable Stack)", "Chest Press Machine (Plate Loaded)",
  "Dip Station", "Dumbbells", "Elliptical", "EZ Barbell", "Functional Trainer", "Glute Bridge Machine (Cable Stack)",
  "Glute Bridge Machine (Plate Loaded)",
  "Glute Ham Raise Unit", "Glute Kickback Machine", "Hack Squat Machine (Cable Stack)", "Hack Squat Machine (Plate Loaded)",
  "Incline Chest Press Machine", "Jacobs Ladder", "Jump Rope", "Kettlebells", "Lateral Raise Machine",
  "Lat Pulldown Machine", "Laying Leg Curl Machine", "Leg Curl Machine", "Leg Extension / Leg Curl Machine",
  "Leg Extension Machine", "Leg Press Machine (Cable Stack)", "Leg Press Machine (Plate Loaded)", "Loop Band",
  "Machine Row", "Mat", "Medicine Ball", "Nordic Hamstring Curl Machine", "Olympic Decline Bench",
  "Olympic Flat Bench", "Olympic Incline Bench", "Olympic Military Bench", "Olympic Plate Tree", "Pec Fly Machine",
  "Pec Fly / Rear Delt Machine", "Plyo Box", "Preacher Curl Machine", "Pull-Up Bar", "Reverse Fly Machine",
  "Reverse Hyper Machine", "Roman Chair Machine", "Rower", "Seated Cable Row Machine", 
  "Shoulder Press Machine (Cable Stack)", "Shoulder Press Machine (Plate Loaded)", "Ski Erg", "Sled",
  "Smith Machine", "Stability Ball", "Stair Climber", "Standing Leg Curl Machine", "Stationary Bike",
  "Strength Band", "T-Bar Row Machine (Cable Stack)", "T-Bar Row Machine (Plate Loaded)", "Treadmill",
  "Tricep Extension Machine", "TRX Unit", "Weight Plates"
];

export default function BatchContribution() {
  const [images, setImages] = useState<BatchImage[]>([]);
  const [globalEquipment, setGlobalEquipment] = useState("");
  const [globalConfidence, setGlobalConfidence] = useState(95);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const contributionMutation = useMutation({
    mutationFn: async (contribution: any) => {
      return await apiRequest("/api/contributions", "POST", contribution);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contributions/stats"] });
    }
  });

  const generateImageId = () => `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newImages: BatchImage[] = [];
    
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = e.target?.result as string;
          newImages.push({
            id: generateImageId(),
            file,
            preview,
            equipment: globalEquipment,
            confidence: globalConfidence,
            status: 'pending'
          });
          
          if (newImages.length === files.length) {
            setImages(prev => [...prev, ...newImages]);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }, [globalEquipment, globalConfidence]);

  const removeImage = useCallback((imageId: string) => {
    setImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  const updateImage = useCallback((imageId: string, updates: Partial<BatchImage>) => {
    setImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, ...updates } : img
    ));
  }, []);

  const applyGlobalSettings = useCallback(() => {
    setImages(prev => prev.map(img => ({
      ...img,
      equipment: globalEquipment,
      confidence: globalConfidence
    })));
  }, [globalEquipment, globalConfidence]);

  const processImageForUpload = (image: BatchImage): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Optimize for AI training: 640x640 max, maintain aspect ratio
        const maxSize = 640;
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        ctx?.drawImage(img, 0, 0, width, height);
        
        // High quality JPEG for AI training
        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(optimizedDataUrl);
      };
      
      img.src = image.preview;
    });
  };

  const uploadBatch = async () => {
    if (images.length === 0) {
      toast({ title: "No images to upload", variant: "destructive" });
      return;
    }

    const pendingImages = images.filter(img => img.status === 'pending');
    if (pendingImages.length === 0) {
      toast({ title: "All images already processed", variant: "default" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    let completed = 0;
    const total = pendingImages.length;

    for (const image of pendingImages) {
      try {
        updateImage(image.id, { status: 'uploading' });
        
        // Process image for optimal AI training
        const optimizedImageData = await processImageForUpload(image);
        
        const contribution = {
          equipment: image.equipment,
          confidence: image.confidence / 100,
          imageData: optimizedImageData,
          location: { 
            latitude: 0, 
            longitude: 0, 
            accuracy: 0 
          },
          detectedObjects: [
            {
              label: image.equipment,
              confidence: image.confidence / 100,
              bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
            }
          ]
        };

        await contributionMutation.mutateAsync(contribution);
        updateImage(image.id, { status: 'success' });
        
      } catch (error: any) {
        console.error(`Failed to upload ${image.equipment}:`, error);
        updateImage(image.id, { 
          status: 'error', 
          errorMessage: error.message || 'Upload failed' 
        });
      }
      
      completed++;
      setUploadProgress((completed / total) * 100);
    }

    setIsUploading(false);
    
    const successCount = images.filter(img => img.status === 'success').length;
    const errorCount = images.filter(img => img.status === 'error').length;
    
    toast({
      title: "Batch Upload Complete",
      description: `${successCount} successful, ${errorCount} failed`,
      variant: successCount > 0 ? "default" : "destructive"
    });
  };

  const clearCompleted = () => {
    setImages(prev => prev.filter(img => img.status === 'pending' || img.status === 'uploading'));
  };

  const pendingCount = images.filter(img => img.status === 'pending').length;
  const successCount = images.filter(img => img.status === 'success').length;
  const errorCount = images.filter(img => img.status === 'error').length;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Batch Equipment Contribution
          </CardTitle>
          <CardDescription>
            Optimized for high-volume personal data collection. Upload multiple equipment photos with streamlined tagging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Global Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="global-equipment">Default Equipment Type</Label>
              <Select value={globalEquipment} onValueChange={setGlobalEquipment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment type" />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_PRESETS.map((equipment) => (
                    <SelectItem key={equipment} value={equipment}>
                      {equipment}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="global-confidence">Default Confidence</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="global-confidence"
                  type="number"
                  min="50"
                  max="100"
                  value={globalConfidence}
                  onChange={(e) => setGlobalConfidence(Number(e.target.value))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={applyGlobalSettings} variant="outline" size="sm">
                Apply to All
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Camera className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <Button 
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="lg"
            >
              Select Images
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              Choose multiple images for batch processing
            </p>
          </div>

          {/* Upload Statistics */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{pendingCount}</div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{successCount}</div>
                <div className="text-sm text-muted-foreground">Success</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{images.length}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={uploadBatch} 
              disabled={isUploading || pendingCount === 0}
              size="lg"
            >
              Upload {pendingCount} Images
            </Button>
            
            {(successCount > 0 || errorCount > 0) && (
              <Button 
                onClick={clearCompleted} 
                variant="outline"
                size="lg"
              >
                Clear Completed
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image) => (
            <Card key={image.id} className="relative">
              <CardContent className="p-3">
                <div className="relative aspect-square mb-3">
                  <img
                    src={image.preview}
                    alt="Preview"
                    className="w-full h-full object-cover rounded"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() => removeImage(image.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                  
                  {/* Status Badge */}
                  <Badge 
                    variant={
                      image.status === 'success' ? 'default' :
                      image.status === 'error' ? 'destructive' :
                      image.status === 'uploading' ? 'secondary' : 'outline'
                    }
                    className="absolute bottom-1 left-1"
                  >
                    {image.status === 'success' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {image.status === 'error' && <AlertCircle className="h-3 w-3 mr-1" />}
                    {image.status}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <Select
                    value={image.equipment}
                    onValueChange={(value) => updateImage(image.id, { equipment: value })}
                    disabled={image.status !== 'pending'}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EQUIPMENT_PRESETS.map((equipment) => (
                        <SelectItem key={equipment} value={equipment}>
                          {equipment}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="50"
                      max="100"
                      value={image.confidence}
                      onChange={(e) => updateImage(image.id, { confidence: Number(e.target.value) })}
                      disabled={image.status !== 'pending'}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  
                  {image.status === 'error' && (
                    <p className="text-xs text-red-600">{image.errorMessage}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}