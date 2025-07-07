import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Square, MapPin, Zap } from "lucide-react";

interface DetectedEquipment {
  id: string;
  name: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  position: {
    x: number;
    y: number;
  };
}

interface GymLayout {
  id: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  equipment: DetectedEquipment[];
  dimensions: {
    width: number;
    height: number;
  };
}

export default function GymMapping() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMappingMode, setIsMappingMode] = useState(false);
  const [detectedEquipment, setDetectedEquipment] = useState<DetectedEquipment[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [gymLayout, setGymLayout] = useState<GymLayout | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Geolocation error:", error);
        }
      );
    }
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
      }
    } catch (error) {
      console.error("Camera access error:", error);
      alert("Camera access is required for gym mapping. Please grant permission and try again.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
    setIsMappingMode(false);
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // TODO: Send canvas data to computer vision service
      processFrameForEquipment(canvas);
    }
  };

  const processFrameForEquipment = async (canvas: HTMLCanvasElement) => {
    // Simulate equipment detection for prototype
    // In production, this would call our trained CV model
    const mockDetection: DetectedEquipment = {
      id: `equipment_${Date.now()}`,
      name: ["Bench Press", "Squat Rack", "Dumbbell Rack", "Cable Machine", "Treadmill"][Math.floor(Math.random() * 5)],
      confidence: 0.75 + Math.random() * 0.24, // 75-99% confidence
      bbox: {
        x: Math.random() * (canvas.width * 0.6),
        y: Math.random() * (canvas.height * 0.6),
        width: 100 + Math.random() * 200,
        height: 80 + Math.random() * 150
      },
      position: {
        x: Math.random() * 100, // Percentage of gym width
        y: Math.random() * 100  // Percentage of gym height
      }
    };

    // Add to detected equipment (avoid duplicates in real implementation)
    setDetectedEquipment(prev => {
      const exists = prev.some(eq => 
        Math.abs(eq.position.x - mockDetection.position.x) < 5 &&
        Math.abs(eq.position.y - mockDetection.position.y) < 5
      );
      
      if (!exists && prev.length < 10) { // Limit for prototype
        return [...prev, mockDetection];
      }
      return prev;
    });
  };

  const startMapping = () => {
    setIsMappingMode(true);
    setDetectedEquipment([]);
    
    // Start continuous frame capture for equipment detection
    const interval = setInterval(() => {
      if (isMappingMode) {
        captureFrame();
      } else {
        clearInterval(interval);
      }
    }, 2000); // Capture every 2 seconds
  };

  const saveGymLayout = () => {
    if (!currentLocation) {
      alert("Location access is required to save gym layouts");
      return;
    }

    const layout: GymLayout = {
      id: `gym_${Date.now()}`,
      name: `Gym at ${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}`,
      location: currentLocation,
      equipment: detectedEquipment,
      dimensions: {
        width: 100, // Would be calculated from mapping
        height: 100
      }
    };

    setGymLayout(layout);
    setIsMappingMode(false);
    
    // TODO: Save to backend/Airtable
    console.log("Gym layout created:", layout);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Gym Mapping Prototype</h1>
        <p className="text-muted-foreground">
          Computer vision-powered gym equipment detection and spatial mapping
        </p>
      </div>

      {/* Location Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentLocation ? (
            <p className="text-sm text-green-600">
              ✓ Location detected: {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
            </p>
          ) : (
            <p className="text-sm text-amber-600">
              ⚠ Requesting location access for gym identification...
            </p>
          )}
        </CardContent>
      </Card>

      {/* Camera Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Camera & Detection
          </CardTitle>
          <CardDescription>
            Use your device camera to scan and identify gym equipment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {!isStreaming ? (
              <Button onClick={startCamera} className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Start Camera
              </Button>
            ) : (
              <>
                <Button onClick={stopCamera} variant="outline">
                  Stop Camera
                </Button>
                {!isMappingMode ? (
                  <Button onClick={startMapping} className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Start Mapping
                  </Button>
                ) : (
                  <Button onClick={saveGymLayout} className="flex items-center gap-2">
                    <Square className="h-4 w-4" />
                    Save Gym Layout
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Video Stream */}
          {isStreaming && (
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-w-2xl mx-auto rounded-lg border"
                style={{ transform: 'scaleX(-1)' }} // Mirror for selfie-like experience
              />
              {isMappingMode && (
                <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded text-sm">
                  🔴 MAPPING
                </div>
              )}
            </div>
          )}

          {/* Hidden canvas for frame processing */}
          <canvas ref={canvasRef} className="hidden" />
        </CardContent>
      </Card>

      {/* Detected Equipment */}
      {detectedEquipment.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detected Equipment ({detectedEquipment.length})</CardTitle>
            <CardDescription>
              Equipment identified through computer vision
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {detectedEquipment.map((equipment) => (
                <div key={equipment.id} className="flex flex-col items-center space-y-1">
                  <Badge variant="secondary" className="text-xs">
                    {equipment.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(equipment.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gym Layout Preview */}
      {gymLayout && (
        <Card>
          <CardHeader>
            <CardTitle>Gym Layout Created</CardTitle>
            <CardDescription>
              Layout saved for location: {gymLayout.location.lat.toFixed(6)}, {gymLayout.location.lng.toFixed(6)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm">
                <strong>Equipment Count:</strong> {gymLayout.equipment.length}
              </p>
              <p className="text-sm">
                <strong>Equipment Types:</strong> {[...new Set(gymLayout.equipment.map(e => e.name))].join(', ')}
              </p>
              <p className="text-xs text-muted-foreground">
                Layout data ready for integration with SuprSet pairing logic
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Technical Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Prototype Status</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>✅ Camera access and video streaming</p>
          <p>✅ Geolocation for gym identification</p>
          <p>✅ Frame capture and processing pipeline</p>
          <p>🔄 Mock equipment detection (ready for real CV model)</p>
          <p>⏳ Need: Trained computer vision model for gym equipment</p>
          <p>⏳ Need: Backend integration for gym layout storage</p>
          <p>⏳ Need: Community sharing and layout retrieval</p>
        </CardContent>
      </Card>
    </div>
  );
}