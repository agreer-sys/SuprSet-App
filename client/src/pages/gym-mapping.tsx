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
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
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

  const getCurrentLocation = async () => {
    console.log("Requesting location permission...");
    
    if (!('geolocation' in navigator)) {
      setLocationError("Geolocation not supported");
      return;
    }

    // Check permission status if available
    if ('permissions' in navigator) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        console.log("Location permission status:", permission.state);
        setLocationPermission(permission.state as 'prompt' | 'granted' | 'denied');
        
        if (permission.state === 'denied') {
          setLocationError("Location access denied. Please enable in browser settings.");
          return;
        }
      } catch (permError) {
        console.log("Permission API not available, proceeding with location request");
      }
    }

    // Request location with high accuracy
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("✅ Location obtained:", position.coords.latitude, position.coords.longitude);
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationPermission('granted');
        setLocationError(null);
      },
      (error) => {
        console.error("Geolocation error:", error);
        let errorMessage = "Unknown location error";
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location access denied by user";
            setLocationPermission('denied');
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information unavailable";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out";
            break;
        }
        
        setLocationError(errorMessage);
        console.log("Location error details:", errorMessage);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
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
        console.log("Video element ready:", !!videoRef.current);
        console.log("Stream tracks:", stream.getTracks().length);
        
        // Set the stream
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // iOS-specific video setup
        if (isIOS) {
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('webkit-playsinline', 'true');
        }
        
        // Immediately set streaming to true and let video load in background
        console.log("✅ Video stream set successfully");
        console.log("Setting isStreaming to true...");
        setIsStreaming(true);
        
        // Try to play video (don't await to avoid blocking)
        setTimeout(async () => {
          try {
            if (videoRef.current) {
              console.log("Attempting to play video...");
              await videoRef.current.play();
              console.log("Video playing successfully");
            }
          } catch (playError) {
            console.warn("Video play error (non-blocking):", playError);
          }
        }, 100);
        
        // Log camera details
        const track = stream.getVideoTracks()[0];
        if (track) {
          console.log("Active camera:", track.label);
          console.log("Camera settings:", track.getSettings());
          console.log("Camera capabilities:", track.getCapabilities?.());
        }
      } else {
        console.error("Video element or stream not available:", {
          videoRef: !!videoRef.current,
          stream: !!stream
        });
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
      console.log("🔍 Processing frame for AI detection...");
      const video = videoRef.current;
      let poses: any[] = [];
      let objects: any[] = [];
      
      console.log("Models status:", {
        pose: modelsLoaded.pose,
        objects: modelsLoaded.objects,
        poseDetectorRef: !!poseDetectorRef.current,
        objectDetectorRef: !!objectDetectorRef.current
      });
      
      // Run pose detection and object detection in parallel
      if (modelsLoaded.pose && poseDetectorRef.current) {
        console.log("🧍 Running BlazePose detection...");
        poses = await poseDetectorRef.current.estimatePoses(video) || [];
        console.log("BlazePose result:", poses.length, "poses detected");
      }

      if (modelsLoaded.objects && objectDetectorRef.current) {
        console.log("🏋️ Running COCO-SSD detection...");
        objects = await objectDetectorRef.current.detect(video) || [];
        console.log("COCO-SSD result:", objects.length, "objects detected");
        
        // Log all detected objects for debugging
        objects.forEach((obj, idx) => {
          console.log(`Object ${idx}: ${obj.class} (confidence: ${(obj.score * 100).toFixed(1)}%)`);
        });
      }

      // Add Roboflow gym equipment detection if available
      let roboflowEquipment: any[] = [];
      if (roboflowDetector.isReady()) {
        try {
          // Create canvas from video for Roboflow
          const roboflowCanvas = document.createElement('canvas');
          roboflowCanvas.width = video.videoWidth;
          roboflowCanvas.height = video.videoHeight;
          const roboflowCtx = roboflowCanvas.getContext('2d');
          roboflowCtx?.drawImage(video, 0, 0);
          
          const base64Image = roboflowDetector.canvasToBase64(roboflowCanvas);
          const roboflowPredictions = await roboflowDetector.detectEquipment(base64Image);
          
          // Convert Roboflow predictions to our format
          roboflowEquipment = roboflowPredictions.map(pred => ({
            class: roboflowDetector.mapToExerciseEquipment(pred.class),
            score: pred.confidence,
            bbox: [pred.x - pred.width/2, pred.y - pred.height/2, pred.width, pred.height]
          }));
          
          console.log(`Roboflow detected ${roboflowEquipment.length} gym equipment items`);
        } catch (error) {
          console.error("Roboflow detection failed:", error);
        }
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
        'person', 'chair', 'bench', 'dumbbell', 'sports ball', 'bicycle',
        'bottle', 'cup', 'cell phone', 'laptop', 'tv', 'backpack', 'handbag'
      ];
      
      console.log("Filtering objects for gym relevance...");
      const relevantObjects = objects.filter(obj => {
        const isRelevant = gymRelevantClasses.includes(obj.class) && obj.score > 0.3; // Lower threshold
        if (isRelevant) {
          console.log(`✅ Relevant object: ${obj.class} (${(obj.score * 100).toFixed(1)}%)`);
        }
        return isRelevant;
      });
      
      console.log(`Found ${relevantObjects.length} relevant objects out of ${objects.length} total`);
      
      // Also log ALL objects for debugging (regardless of relevance)
      if (objects.length > 0) {
        console.log("All detected objects:");
        objects.forEach((obj, idx) => {
          console.log(`  ${idx + 1}. ${obj.class}: ${(obj.score * 100).toFixed(1)}%`);
        });
      }

      // Convert to our equipment format - combine COCO-SSD and Roboflow
      const cocoEquipment: DetectedEquipment[] = relevantObjects.map((obj: any, idx: number) => ({
        id: `coco_${Date.now()}_${idx}`,
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

      // Add Roboflow equipment detections
      const roboflowEquipmentFormatted: DetectedEquipment[] = roboflowEquipment.map((equipment: any, idx: number) => ({
        id: `roboflow_${Date.now()}_${idx}`,
        name: equipment.class,
        confidence: equipment.score,
        bbox: {
          x: equipment.bbox[0],
          y: equipment.bbox[1],
          width: equipment.bbox[2],
          height: equipment.bbox[3]
        },
        position: {
          x: equipment.bbox[0] + equipment.bbox[2] / 2,
          y: equipment.bbox[1] + equipment.bbox[3] / 2
        },
        source: 'roboflow'
      }));

      const newEquipment = [...cocoEquipment, ...roboflowEquipmentFormatted];

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
      console.log("❌ AI models not ready:", modelsLoaded);
      alert("AI models are still loading. Please wait a moment.");
      return;
    }

    console.log("🚀 Starting AI mapping mode...");
    console.log("Available models:", {
      pose: modelsLoaded.pose,
      objects: modelsLoaded.objects,
      poseDetector: !!poseDetectorRef.current,
      objectDetector: !!objectDetectorRef.current
    });
    
    setIsMappingMode(true);
    
    // Start capturing frames every 2 seconds for better processing
    console.log("Setting up frame capture interval...");
    
    // Use a different approach to avoid closure issues
    let frameCount = 0;
    const interval = setInterval(() => {
      frameCount++;
      console.log(`⏰ Frame ${frameCount} - checking mapping status...`);
      
      // Check current state instead of closure variable
      const mappingActive = document.querySelector('[data-mapping-active="true"]') !== null;
      console.log("Mapping active:", mappingActive);
      
      if (mappingActive) {
        console.log("📸 Capturing frame for AI analysis...");
        captureFrame();
      } else {
        console.log("Mapping not active, stopping interval");
        clearInterval(interval);
      }
    }, 2000);
    
    // Store interval reference for cleanup
    (window as any).mappingInterval = interval;
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
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${roboflowDetector.isReady() ? 'bg-green-500' : 'bg-gray-400'}`} />
                <span className="text-sm">
                  Roboflow Gym Equipment Detection {roboflowDetector.isReady() ? '(Active)' : '(Not Configured)'}
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  currentLocation ? 'bg-green-500' : 
                  locationPermission === 'denied' ? 'bg-red-500' : 
                  'bg-yellow-500'
                }`}></div>
                <span className="text-sm">
                  {currentLocation ? 'Location Available' : 
                   locationError ? 'Location Error' : 
                   'Location Pending'}
                </span>
              </div>
              
              {currentLocation && (
                <div className="text-xs text-gray-600 space-y-1">
                  <div>📍 Lat: {currentLocation.lat.toFixed(6)}</div>
                  <div>📍 Lng: {currentLocation.lng.toFixed(6)}</div>
                </div>
              )}
              
              {locationError && (
                <div className="text-xs text-red-600">
                  {locationError}
                </div>
              )}
              
              {!currentLocation && (
                <Button 
                  onClick={getCurrentLocation}
                  size="sm" 
                  variant="outline"
                  className="w-full text-xs mt-2"
                >
                  Request Location
                </Button>
              )}
            </div>
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
                <Button 
                  onClick={() => {
                    console.log("Start Camera button clicked");
                    startCamera();
                  }} 
                  className="flex items-center gap-2"
                >
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

            {/* Video Stream Container - Always Present */}
            <div className={`relative bg-black rounded-lg overflow-hidden min-h-[240px] border-2 ${isStreaming ? 'border-white' : 'border-gray-500'}`}>
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
                  backgroundColor: 'black',
                  opacity: isStreaming ? 1 : 0.3
                }}
                onLoadedData={() => console.log("Video data loaded")}
                onPlay={() => console.log("Video started playing")}
                onError={(e) => console.error("Video error:", e)}
                onLoadedMetadata={() => console.log("Video metadata loaded, size:", videoRef.current?.videoWidth, "x", videoRef.current?.videoHeight)}
              />
              
              {/* Camera status overlay */}
              <div 
                className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs"
                data-mapping-active={isMappingMode ? "true" : "false"}
              >
                {!isStreaming ? '📱 Camera Not Active' : isMappingMode ? '🔴 AI Mapping Active' : '📷 Camera Ready'}
              </div>
              
              {/* Detection overlay */}
              {isStreaming && isMappingMode && (
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
              {isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 border-2 border-white/50 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white/50 rounded-full"></div>
                  </div>
                </div>
              )}
            </div>

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