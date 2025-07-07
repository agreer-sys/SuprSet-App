import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Square, MapPin, Zap, Brain, Target } from "lucide-react";

// Import TensorFlow.js and models
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

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
  source: 'pose' | 'object' | 'roboflow';
}

interface DetectedPose {
  keypoints: Array<{
    x: number;
    y: number;
    score: number;
    name: string;
  }>;
  score: number;
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
  const [detectedPoses, setDetectedPoses] = useState<DetectedPose[]>([]);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [gymLayout, setGymLayout] = useState<GymLayout | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState({
    pose: false,
    objects: false
  });
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseDetectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const objectDetectorRef = useRef<cocoSsd.ObjectDetection | null>(null);

  // Initialize models and get user location
  useEffect(() => {
    initializeModels();
    getCurrentLocation();
  }, []);

  const getCurrentLocation = () => {
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
  };

  const initializeModels = async () => {
    setIsLoadingModels(true);
    try {
      // Initialize TensorFlow.js backend
      await tf.ready();
      console.log("TensorFlow.js backend initialized");

      // Load pose detection model
      const poseDetector = await poseDetection.createDetector(
        poseDetection.SupportedModels.BlazePose,
        {
          runtime: 'tfjs',
          modelType: 'full'
        }
      );
      poseDetectorRef.current = poseDetector;
      setModelsLoaded(prev => ({ ...prev, pose: true }));
      console.log("BlazePose model loaded");

      // Load object detection model
      const objectDetector = await cocoSsd.load();
      objectDetectorRef.current = objectDetector;
      setModelsLoaded(prev => ({ ...prev, objects: true }));
      console.log("COCO-SSD object detection model loaded");

    } catch (error) {
      console.error("Error loading models:", error);
    } finally {
      setIsLoadingModels(false);
    }
  };

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
    if (!videoRef.current || !modelsLoaded.pose || !modelsLoaded.objects) return;

    try {
      const video = videoRef.current;
      
      // Run pose detection and object detection in parallel
      const [poses, objects] = await Promise.all([
        poseDetectorRef.current?.estimatePoses(video) || [],
        objectDetectorRef.current?.detect(video) || []
      ]);

      // Process pose detection results
      if (poses.length > 0) {
        setDetectedPoses(poses.map(pose => ({
          keypoints: pose.keypoints || [],
          score: pose.score || 0
        })));
      }

      // Process object detection results  
      const gymRelevantClasses = [
        'person', 'chair', 'bench', 'dumbbell', 'sports ball', 'bicycle'
      ];
      
      const relevantObjects = objects.filter(obj => 
        gymRelevantClasses.includes(obj.class) && obj.score > 0.5
      );

      const newEquipment: DetectedEquipment[] = relevantObjects.map(obj => ({
        id: `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: mapToGymEquipment(obj.class),
        confidence: obj.score,
        bbox: obj.bbox,
        position: {
          x: (obj.bbox[0] + obj.bbox[2] / 2) / canvas.width * 100,
          y: (obj.bbox[1] + obj.bbox[3] / 2) / canvas.height * 100
        },
        source: 'object'
      }));

      // Update detected equipment (avoid duplicates)
      setDetectedEquipment(prev => {
        const updated = [...prev];
        newEquipment.forEach(newEq => {
          const exists = updated.some(eq => 
            Math.abs(eq.position.x - newEq.position.x) < 10 &&
            Math.abs(eq.position.y - newEq.position.y) < 10 &&
            eq.name === newEq.name
          );
          
          if (!exists) {
            updated.push(newEq);
          }
        });
        
        // Keep only recent detections (last 20)
        return updated.slice(-20);
      });

    } catch (error) {
      console.error("Error processing frame:", error);
    }
  };

  const mapToGymEquipment = (cocoClass: string): string => {
    const mapping: Record<string, string> = {
      'person': 'Person (Trainer/User)',
      'chair': 'Adjustable Bench',
      'bench': 'Flat Bench',
      'dumbbell': 'Dumbbell',
      'sports ball': 'Exercise Ball',
      'bicycle': 'Exercise Bike'
    };
    return mapping[cocoClass] || cocoClass;
  };

  const startMapping = () => {
    if (!modelsLoaded.pose || !modelsLoaded.objects) {
      alert("AI models are still loading. Please wait a moment.");
      return;
    }
    
    setIsMappingMode(true);
    setDetectedEquipment([]);
    setDetectedPoses([]);
    
    // Start continuous frame capture for equipment detection
    const interval = setInterval(() => {
      if (isMappingMode) {
        captureFrame();
      } else {
        clearInterval(interval);
      }
    }, 1500); // Capture every 1.5 seconds for real-time feel
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

      {/* AI Models Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Models Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${modelsLoaded.pose ? 'bg-green-500' : isLoadingModels ? 'bg-yellow-500' : 'bg-red-500'}`} />
              <span className="text-sm">
                MediaPipe BlazePose (33-keypoint pose detection)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${modelsLoaded.objects ? 'bg-green-500' : isLoadingModels ? 'bg-yellow-500' : 'bg-red-500'}`} />
              <span className="text-sm">
                COCO-SSD Object Detection (gym equipment)
              </span>
            </div>
            {isLoadingModels && (
              <p className="text-sm text-amber-600">🔄 Loading AI models...</p>
            )}
          </div>
        </CardContent>
      </Card>

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
                  <Button 
                    onClick={startMapping} 
                    className="flex items-center gap-2"
                    disabled={!modelsLoaded.pose || !modelsLoaded.objects}
                  >
                    <Zap className="h-4 w-4" />
                    Start AI Mapping
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
                  <Badge 
                    variant={equipment.source === 'object' ? "default" : "secondary"} 
                    className="text-xs"
                  >
                    {equipment.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(equipment.confidence * 100).toFixed(0)}% ({equipment.source})
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
          <p>✅ MediaPipe BlazePose for 33-keypoint human pose detection</p>
          <p>✅ COCO-SSD object detection for gym equipment</p>
          <p>✅ Real-time AI analysis combining pose + object detection</p>
          <p>⏳ Next: Integrate Roboflow's 6,620-image gym equipment dataset</p>
          <p>⏳ Next: Backend integration for gym layout storage</p>
          <p>⏳ Next: Community sharing and layout retrieval</p>
        </CardContent>
      </Card>
    </div>
  );
}