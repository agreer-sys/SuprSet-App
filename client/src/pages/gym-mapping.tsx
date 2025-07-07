import { useState, useRef, useEffect } from "react";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Square, MapPin, Zap, Brain, Target, Navigation, Users } from "lucide-react";

// Import TensorFlow.js and models
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// Import our custom AI services
import { roboflowDetector } from '@/lib/roboflow-api';
import { spatialMapper, type GymLayout, type EquipmentZone } from '@/lib/spatial-mapping';

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
  const [equipmentZones, setEquipmentZones] = useState<EquipmentZone[]>([]);
  const [crowdingLevel, setCrowdingLevel] = useState<'low' | 'medium' | 'high'>('low');
  
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
    if ('geolocation' in navigator) {
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
      // Initialize TensorFlow.js backend with fallback
      await tf.ready();
      console.log("TensorFlow.js backend initialized");

      // Load pose detection model with error handling
      try {
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
      } catch (poseError) {
        console.warn("BlazePose failed to load (WebGL/WebGPU limitation in this environment):", poseError);
      }

      // Load object detection model with error handling
      try {
        const objectDetector = await cocoSsd.load();
        objectDetectorRef.current = objectDetector;
        setModelsLoaded(prev => ({ ...prev, objects: true }));
        console.log("COCO-SSD object detection model loaded");
      } catch (objectError) {
        console.warn("COCO-SSD failed to load (WebGL/WebGPU limitation in this environment):", objectError);
      }

    } catch (error) {
      console.error("TensorFlow.js initialization failed:", error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const startCamera = async () => {
    try {
      console.log("Starting camera on iOS device...");
      console.log("User agent:", navigator.userAgent);
      
      // Check if we're on iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      console.log("iOS detected:", isIOS);
      
      // Check camera permissions first
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          console.log("Camera permission status:", permission.state);
        } catch (permError) {
          console.log("Permission query not supported");
        }
      }
      
      // Check available devices first
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        console.log("Available cameras:", videoDevices.length);
        videoDevices.forEach((device, idx) => {
          console.log(`Camera ${idx}:`, device.label || 'Unknown Camera', device.deviceId);
        });
      } catch (deviceError) {
        console.error("Could not enumerate devices:", deviceError);
      }
      
      // For iOS, try different approaches
      let stream;
      if (isIOS) {
        console.log("Using iOS-specific camera configuration...");
        try {
          // iOS often works better with simpler constraints first
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
              width: { ideal: 1920, max: 1920 },
              height: { ideal: 1080, max: 1080 }
            }
          });
          console.log("✅ iOS environment camera successful");
        } catch (iosError) {
          console.warn("iOS environment camera failed:", iosError);
          // Fallback for iOS
          stream = await navigator.mediaDevices.getUserMedia({
            video: true
          });
          console.log("✅ iOS basic camera successful");
        }
      } else {
        // Non-iOS devices
        try {
          console.log("Attempting exact back camera...");
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { exact: 'environment' },
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 }
            }
          });
          console.log("✅ Exact back camera successful");
        } catch (exactError) {
          console.warn("Exact back camera failed, trying ideal constraint:", exactError);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 }
              }
            });
            console.log("✅ Ideal back camera successful");
          } catch (idealError) {
            console.warn("Ideal back camera failed, using default camera:", idealError);
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 }
              }
            });
            console.log("✅ Default camera successful");
          }
        }
      }
      
      if (videoRef.current && stream) {
        console.log("Setting video source...");
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // iOS-specific video setup
        if (isIOS) {
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('webkit-playsinline', 'true');
        }
        
        // Wait for video to be ready with timeout
        const videoLoadPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Video load timeout"));
          }, 10000);
          
          videoRef.current!.onloadedmetadata = () => {
            clearTimeout(timeout);
            console.log("Video metadata loaded");
            if (videoRef.current) {
              videoRef.current.play().then(() => {
                console.log("Video playing, dimensions:", videoRef.current!.videoWidth, "x", videoRef.current!.videoHeight);
                resolve();
              }).catch(playError => {
                console.error("Video play failed:", playError);
                reject(playError);
              });
            }
          };
          
          videoRef.current!.onerror = (error) => {
            clearTimeout(timeout);
            console.error("Video error:", error);
            reject(error);
          };
        });
        
        await videoLoadPromise;
        console.log("✅ Video stream set successfully");
        console.log("Setting isStreaming to true...");
        setIsStreaming(true);
        
        // Log camera details
        const track = stream.getVideoTracks()[0];
        if (track) {
          console.log("Active camera:", track.label);
          console.log("Camera settings:", track.getSettings());
          console.log("Camera capabilities:", track.getCapabilities?.());
        }
      }
    } catch (error) {
      console.error("Camera access error:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        constraint: error.constraint
      });
      
      let errorMessage = "Camera access failed. ";
      if (error.name === 'NotAllowedError') {
        errorMessage += "Please allow camera access in your browser settings and try again.";
      } else if (error.name === 'NotFoundError') {
        errorMessage += "No camera found on this device.";
      } else if (error.name === 'NotSupportedError') {
        errorMessage += "Camera not supported in this browser.";
      } else {
        errorMessage += "Please check camera permissions and try again.";
      }
      
      alert(errorMessage);
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

  const processFrameForEquipment = async (canvas: HTMLCanvasElement) => {
    if (!videoRef.current) return;

    try {
      const video = videoRef.current;
      let poses: any[] = [];
      let objects: any[] = [];
      
      // Run pose detection and object detection in parallel
      if (modelsLoaded.pose && poseDetectorRef.current) {
        poses = await poseDetectorRef.current.estimatePoses(video) || [];
      }

      if (modelsLoaded.objects && objectDetectorRef.current) {
        objects = await objectDetectorRef.current.detect(video) || [];
      }

      // Update detected poses
      if (poses.length > 0) {
        setDetectedPoses(poses.map((pose: any) => ({
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

      // Convert to our equipment format
      const newEquipment: DetectedEquipment[] = relevantObjects.map((obj: any, idx: number) => ({
        id: `obj_${Date.now()}_${idx}`,
        name: mapCocoToGymEquipment(obj.class),
        confidence: obj.score,
        bbox: {
          x: obj.bbox[0],
          y: obj.bbox[1],
          width: obj.bbox[2],
          height: obj.bbox[3]
        },
        position: {
          x: obj.bbox[0] + obj.bbox[2] / 2,
          y: obj.bbox[1] + obj.bbox[3] / 2
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

      // Analyze spatial layout and crowd levels
      const zones = spatialMapper.createEquipmentZones(detectedEquipment);
      setEquipmentZones(zones);
      
      const crowdLevel = spatialMapper.analyzeCrowdLevel(detectedPoses, detectedEquipment);
      setCrowdingLevel(crowdLevel);

    } catch (error) {
      console.error("Frame processing error:", error);
    }
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
      
      processFrameForEquipment(canvas);
    }
  };

  const mapCocoToGymEquipment = (cocoClass: string): string => {
    const mapping: Record<string, string> = {
      'person': 'Person',
      'chair': 'Bench/Seat',
      'bench': 'Bench',
      'dumbbell': 'Dumbbell',
      'sports ball': 'Medicine Ball',
      'bicycle': 'Exercise Bike'
    };
    return mapping[cocoClass] || cocoClass;
  };

  const startMapping = () => {
    if (!modelsLoaded.pose && !modelsLoaded.objects) {
      alert("AI models are still loading. Please wait a moment.");
      return;
    }

    setIsMappingMode(true);
    
    // Start capturing frames every 1.5 seconds
    const interval = setInterval(() => {
      if (isMappingMode) {
        captureFrame();
      } else {
        clearInterval(interval);
      }
    }, 1500);
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
      zones: equipmentZones,
      dimensions: {
        width: 100,
        height: 100
      },
      crowdingLevel,
      lastUpdated: Date.now(),
      contributors: 1
    };

    setGymLayout(layout);
    setIsMappingMode(false);
    
    console.log("Gym layout created:", layout);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
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
              <p className="text-sm">
                📍 Location: {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Requesting location access...</p>
            )}
          </CardContent>
        </Card>

        {/* Camera & Detection */}
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
                      disabled={!modelsLoaded.pose && !modelsLoaded.objects}
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

            {/* Debug Info */}
            <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
              Streaming: {isStreaming ? 'Yes' : 'No'} | 
              Video Ref: {videoRef.current ? 'Ready' : 'Not Ready'} | 
              Stream Ref: {streamRef.current ? 'Active' : 'Inactive'}
            </div>

            {/* Video Stream */}
            {isStreaming && (
              <div className="relative bg-black rounded-lg overflow-hidden min-h-[240px] border-2 border-white">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  webkit-playsinline="true"
                  className="w-full h-64 sm:h-72 md:h-80 lg:h-96 object-cover rounded-lg bg-gray-900"
                  style={{ 
                    minHeight: '240px',
                    maxHeight: '480px',
                    aspectRatio: '16/9',
                    display: 'block',
                    backgroundColor: 'black'
                  }}
                  onLoadedData={() => console.log("Video data loaded")}
                  onPlay={() => console.log("Video started playing")}
                  onError={(e) => console.error("Video error:", e)}
                  onLoadedMetadata={() => console.log("Video metadata loaded, size:", videoRef.current?.videoWidth, "x", videoRef.current?.videoHeight)}
                />
                
                {/* Camera overlay UI */}
                <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                  {isMappingMode ? '🔴 AI Mapping Active' : '📷 Camera Ready'}
                </div>
                
                {/* Detection overlay */}
                {isMappingMode && (
                  <div className="absolute bottom-2 left-2 right-2 bg-black/70 text-white p-2 rounded text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>Equipment: {detectedEquipment.length}</div>
                      <div>People: {detectedPoses.length}</div>
                      <div>Zones: {equipmentZones.length}</div>
                      <div>Crowd: {crowdingLevel.toUpperCase()}</div>
                    </div>
                  </div>
                )}
                
                {/* Crosshair for targeting */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 border-2 border-white/50 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                  </div>
                </div>
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
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {detectedEquipment.map(equipment => (
                  <div key={equipment.id} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="font-medium">{equipment.name}</span>
                    <Badge variant="secondary">
                      {Math.round(equipment.confidence * 100)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spatial Intelligence Dashboard */}
        {(equipmentZones.length > 0 || detectedPoses.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Navigation className="h-5 w-5" />
                Spatial Intelligence
              </CardTitle>
              <CardDescription>
                Real-time gym layout analysis and crowd monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Equipment Zones */}
                {equipmentZones.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Equipment Zones</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {equipmentZones.map(zone => (
                        <div key={zone.id} className="bg-muted p-2 rounded">
                          <div className="font-medium">{zone.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {zone.equipment.length} items • {zone.type}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Crowd Level */}
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Crowd Level Analysis
                  </h4>
                  <div className="flex items-center gap-2">
                    <Badge variant={crowdingLevel === 'low' ? 'secondary' : crowdingLevel === 'medium' ? 'default' : 'destructive'}>
                      {crowdingLevel.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {detectedPoses.length} people detected
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Gym Layout Created */}
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

        {/* Prototype Status */}
        <Card>
          <CardHeader>
            <CardTitle>Prototype Status</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>✅ Camera access and video streaming</p>
            <p>✅ Geolocation for gym identification</p>
            <p>✅ Frame capture and processing pipeline</p>
            <p>✅ MediaPipe BlazePose for 33-keypoint human pose detection</p>
            <p>✅ COCO-SSD object detection for gym equipment (baseline)</p>
            <p>✅ Real-time AI analysis combining pose + object detection</p>
            <p>✅ Spatial mapping with equipment zones and crowd analysis</p>
            <p>🔄 Next: Create private Roboflow account for custom dataset</p>
            <p>🔄 Next: Collect 1,000+ gym equipment photos for training</p>
            <p>🔄 Next: Train custom model for SuprSet-specific equipment</p>
            <p>⏳ Future: Backend integration for gym layout storage</p>
            <p>⏳ Future: Community sharing and layout retrieval</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}