import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Image, CheckCircle, XCircle, BarChart3 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Equipment categories for the stealth dataset collection
const EQUIPMENT_CATEGORIES = [
  "Barbell", "Dumbbell", "Kettlebell", "Cable Machine", "Smith Machine",
  "Leg Press", "Lat Pulldown", "Seated Row", "Chest Press", "Shoulder Press",
  "Leg Extension", "Leg Curl", "Calf Raise", "Pull-up Bar", "Dip Station",
  "Bench", "Squat Rack", "Power Rack", "Preacher Curl", "Roman Chair",
  "Battle Ropes", "TRX", "Resistance Bands", "Medicine Ball", "Stability Ball"
];

interface BatchContribution {
  equipment: string;
  imageData: string;
  confidence: number;
  tags: string[];
  userTags: string[];
  notes?: string;
}

interface ContributionResult {
  index: number;
  success: boolean;
  id?: string;
  error?: string;
}

export default function BatchContribute() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedEquipment, setSelectedEquipment] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [userTags, setUserTags] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [results, setResults] = useState<ContributionResult[]>([]);

  // Fetch analytics data
  const { data: analytics } = useQuery({
    queryKey: ['/api/contributions/analytics'],
    enabled: isAuthenticated,
  });

  const batchUploadMutation = useMutation({
    mutationFn: async (contributions: BatchContribution[]) => {
      console.log('🚀 Sending request to server...', { contributionsCount: contributions.length });
      
      const response = await fetch('/api/contributions/batch', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'credentials': 'include'
        },
        body: JSON.stringify({ contributions }),
        credentials: 'include'
      });
      
      console.log('📡 Server response:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error:', errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log('✅ Upload successful:', result);
      return result;
    },
    onSuccess: (data: any) => {
      setResults(data.results);
      toast({
        title: "Batch Upload Complete",
        description: `Successfully uploaded ${data.successful}/${data.totalSubmitted} images`,
        variant: data.successful === data.totalSubmitted ? "default" : "destructive"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/analytics'] });
      setSelectedFiles([]);
      setSelectedEquipment("");
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: "Failed to process batch upload",
        variant: "destructive"
      });
    }
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== files.length) {
      toast({
        title: "Invalid Files",
        description: "Please select only image files",
        variant: "destructive"
      });
    }
    
    setSelectedFiles(imageFiles);
  };

  const processImages = async (): Promise<BatchContribution[]> => {
    const contributions: BatchContribution[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setUploadProgress((i / selectedFiles.length) * 50); // First 50% for processing
      
      // Compress image to 640x640 at 70% quality
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = document.createElement('img');
      
      await new Promise((resolve) => {
        img.onload = () => {
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
          ctx.drawImage(img, 0, 0, width, height);
          resolve(null);
        };
        img.src = URL.createObjectURL(file);
      });
      
      const imageData = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      
      const parsedUserTags = userTags
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0);

      contributions.push({
        equipment: selectedEquipment,
        imageData,
        confidence: 0.85, // Default confidence for manual uploads
        tags: [`manual_upload`, `batch_${Date.now()}`],
        userTags: parsedUserTags,
        notes: `Batch upload - ${file.name}`
      });
    }
    
    return contributions;
  };

  const handleBatchUpload = async () => {
    console.log('🔄 Starting batch upload...', { selectedEquipment, filesCount: selectedFiles.length });
    
    if (!selectedEquipment || selectedFiles.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select equipment type and upload images",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setUploadProgress(0);
    setResults([]);

    try {
      console.log('📸 Processing images...');
      const contributions = await processImages();
      console.log('✅ Images processed, uploading to server...', contributions.length);
      setUploadProgress(75); // Processing complete
      
      await batchUploadMutation.mutateAsync(contributions);
      setUploadProgress(100);
      console.log('🎉 Upload complete!');
    } catch (error: any) {
      console.error('❌ Batch upload error:', error);
      toast({
        title: "Upload Error",
        description: error.message || "Failed to upload images",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setUploadProgress(0);
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center">Please sign in to contribute images.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Batch Image Upload</h1>
        <p className="text-muted-foreground">
          Upload multiple images efficiently for AI model training
        </p>
      </div>

      {/* Analytics Overview */}
      {analytics && (analytics as any).qualityMetrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Your Contribution Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{(analytics as any).qualityMetrics.totalContributions}</div>
                <div className="text-sm text-muted-foreground">Total Images</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{Object.keys((analytics as any).equipmentCount || {}).length}</div>
                <div className="text-sm text-muted-foreground">Equipment Types</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{Math.round((analytics as any).qualityMetrics.averageConfidence * 100)}%</div>
                <div className="text-sm text-muted-foreground">Avg Quality</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{(analytics as any).qualityMetrics.verifiedCount}</div>
                <div className="text-sm text-muted-foreground">Verified</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Interface */}
      <Card>
        <CardHeader>
          <CardTitle>Batch Upload</CardTitle>
          <CardDescription>
            Select equipment type and upload multiple images at once
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Equipment Type</label>
            <Select value={selectedEquipment} onValueChange={setSelectedEquipment}>
              <SelectTrigger>
                <SelectValue placeholder="Select equipment type" />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_CATEGORIES.map((equipment) => (
                  <SelectItem key={equipment} value={equipment}>
                    {equipment}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Custom Tags (Optional)</label>
            <Input
              value={userTags}
              onChange={(e) => setUserTags(e.target.value)}
              placeholder="Enter tags separated by commas (e.g., adjustable, heavy-duty, commercial)"
              className="mb-4"
            />
            <p className="text-xs text-muted-foreground mb-4">
              Add descriptive tags to improve AI training quality. Examples: "adjustable", "heavy-duty", "commercial", "beginner-friendly", "olympic"
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Images</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-sm text-gray-600 mb-4">
                Click to select multiple images or drag and drop
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                Select Images
              </Button>
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Selected Files ({selectedFiles.length})</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Image className="h-4 w-4" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(1)}MB)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isProcessing && (
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Processing...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          <Button 
            onClick={handleBatchUpload}
            disabled={!selectedEquipment || selectedFiles.length === 0 || isProcessing}
            className="w-full"
          >
            {isProcessing ? "Processing..." : `Upload ${selectedFiles.length} Images`}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Upload Results
              <Button variant="outline" size="sm" onClick={clearResults}>
                Clear
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded">
                  <span className="text-sm">Image {result.index + 1}</span>
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <Badge variant="secondary">Success</Badge>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-500" />
                        <Badge variant="destructive">Failed</Badge>
                        {result.error && (
                          <span className="text-xs text-muted-foreground truncate max-w-32">
                            {result.error}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}