import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Upload, Check, X, Tag, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ContributionData {
  image: string;
  equipment: string;
  gymLocation?: string;
  notes?: string;
  confidence: number;
}

interface ImageContributionProps {
  onContribute: (data: ContributionData) => void;
  isVisible: boolean;
  onClose: () => void;
}

export default function ImageContribution({ onContribute, isVisible, onClose }: ImageContributionProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [equipmentLabel, setEquipmentLabel] = useState("");
  const [gymLocation, setGymLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Setup camera preview in modal
  useEffect(() => {
    if (isVisible && previewVideoRef.current) {
      const mainVideo = document.querySelector('video') as HTMLVideoElement;
      if (mainVideo && mainVideo.srcObject) {
        // Clone the stream to the preview video
        previewVideoRef.current.srcObject = mainVideo.srcObject;
        previewVideoRef.current.play().catch(console.error);
      }
    }
  }, [isVisible]);

  // Function to capture from the preview video element
  const captureFromMainVideo = () => {
    const videoElement = previewVideoRef.current || document.querySelector('video') as HTMLVideoElement;
    if (videoElement && canvasRef.current) {
      captureFromVideo(videoElement);
    }
  };

  const commonEquipmentTypes = [
    "Bench Press", "Squat Rack", "Cable Machine", "Lat Pulldown", 
    "Leg Press", "Dumbbells", "Barbell", "Smith Machine", 
    "Leg Extension", "Leg Curl", "Chest Fly", "Shoulder Press"
  ];

  const captureFromVideo = (videoElement: HTMLVideoElement) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0);
    
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(imageData);
  };

  const handleEquipmentSelect = (equipment: string) => {
    setEquipmentLabel(equipment);
  };

  const handleSubmit = async () => {
    if (!capturedImage || !equipmentLabel) return;

    setIsSubmitting(true);
    
    try {
      const contributionData: ContributionData = {
        image: capturedImage,
        equipment: equipmentLabel,
        gymLocation: gymLocation || undefined,
        notes: notes || undefined,
        confidence: 1.0 // User-verified, highest confidence
      };

      await onContribute(contributionData);
      
      // Reset form
      setCapturedImage(null);
      setEquipmentLabel("");
      setGymLocation("");
      setNotes("");
      onClose();
    } catch (error) {
      console.error("Failed to submit contribution:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Transparent overlay for camera area */}
      <div className="fixed inset-0 z-40 pointer-events-none" />
      
      {/* Bottom sheet modal */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <Card className="w-full bg-white rounded-t-xl shadow-lg max-h-[70vh] overflow-y-auto border-t">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base font-semibold">
            Contribute Equipment Photo
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent className="space-y-4 px-4 sm:px-6 pb-4">
          {/* Image Capture Area */}
          {capturedImage ? (
            <div className="space-y-2">
              <img 
                src={capturedImage} 
                alt="Captured equipment" 
                className="w-full h-32 sm:h-48 object-cover rounded-lg border"
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCapturedImage(null)}
                className="w-full"
              >
                Retake Photo
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Live Camera Preview */}
              <div className="relative border-2 border-blue-200 rounded-lg overflow-hidden bg-black">
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-40 object-cover"
                />
                <div className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                  LIVE
                </div>
                <div className="absolute bottom-2 left-2 right-2 text-center">
                  <p className="text-white text-xs bg-black/50 px-2 py-1 rounded">
                    Position equipment in frame
                  </p>
                </div>
              </div>
              
              {/* Capture Button - Separate from preview area */}
              <Button 
                onClick={captureFromMainVideo}
                variant="default"
                size="default"
                className="w-full flex items-center justify-center gap-2 h-10"
              >
                <Camera className="h-4 w-4" />
                Capture Equipment Photo
              </Button>
            </div>
          )}

          {/* Equipment Labeling */}
          <div className="space-y-2">
            <Label htmlFor="equipment" className="text-sm font-medium">Equipment Type</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-2">
              {commonEquipmentTypes.map((equipment) => (
                <Button
                  key={equipment}
                  variant={equipmentLabel === equipment ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleEquipmentSelect(equipment)}
                  className="text-xs h-7 sm:h-8 px-2"
                >
                  {equipment}
                </Button>
              ))}
            </div>
            <Input
              id="equipment"
              placeholder="Or type custom equipment..."
              value={equipmentLabel}
              onChange={(e) => setEquipmentLabel(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Optional Fields */}
          <div className="space-y-2">
            <Label htmlFor="location">
              <MapPin className="h-4 w-4 inline mr-1" />
              Gym Location (Optional)
            </Label>
            <Input
              id="location"
              placeholder="e.g., Planet Fitness Downtown"
              value={gymLocation}
              onChange={(e) => setGymLocation(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any additional details about the equipment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Submit Button */}
          <div className="space-y-2">
            <Button 
              onClick={handleSubmit}
              disabled={!capturedImage || !equipmentLabel || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                "Contributing..."
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Contribute to Community Model
                </>
              )}
            </Button>
            
            <div className="text-xs text-gray-500 text-center">
              Your contribution helps improve equipment detection for everyone
            </div>
          </div>

          {/* Privacy Notice */}
          <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-800">
            <strong>Privacy:</strong> Images are processed anonymously. 
            Location data is used only for model training and never shared.
          </div>
        </CardContent>
        </Card>
      </div>
      
      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}