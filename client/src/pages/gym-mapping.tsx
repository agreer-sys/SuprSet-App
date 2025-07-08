import { useState, useRef, useEffect } from "react";
import Header from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Square, MapPin, Zap, Brain, Target, Navigation, Users, Video } from "lucide-react";

// Import TensorFlow.js and models
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// Import our custom AI services
import { roboflowDetector } from '@/lib/roboflow-api';
import { spatialMapper, type GymLayout, type EquipmentZone } from '@/lib/spatial-mapping';
import { communityModelService } from '@/lib/community-model';

import AuthModal from '@/components/auth-modal';
import { useAuth } from '@/hooks/use-auth';

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
  
  // Community contribution state
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [contributionStats, setContributionStats] = useState({ contributionCount: 0, verifiedCount: 0 });
  const [detectionPaused, setDetectionPaused] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [equipmentLabel, setEquipmentLabel] = useState("");
  const [gymLocation, setGymLocationInput] = useState("");
  const [notes, setNotes] = useState("");
  
  // Authentication
  const { user, isAuthenticated, updateUserStats } = useAuth();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseDetectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const objectDetectorRef = useRef<cocoSsd.ObjectDetection | null>(null);

  // Initialize models and get user location
  useEffect(() => {
    initializeModels();
    getCurrentLocation();
    
    // Load user contribution stats
    const stats = communityModelService.getUserStats();
    setContributionStats(stats);
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
      // Initialize TensorFlow.js backend with CPU fallback
      console.log("Initializing TensorFlow.js...");
      
      try {
        await tf.setBackend('webgl');
        await tf.ready();
        console.log("TensorFlow.js WebGL backend initialized");
      } catch (webglError) {
        console.log("WebGL not available, falling back to CPU backend");
        await tf.setBackend('cpu');
        await tf.ready();
        console.log("TensorFlow.js CPU backend initialized");
      }

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
        console.log("BlazePose model loaded successfully");
      } catch (poseError) {
        console.log("BlazePose model not available in this environment, continuing with object detection");
      }

      // Load object detection model with error handling
      try {
        const objectDetector = await cocoSsd.load();
        objectDetectorRef.current = objectDetector;
        setModelsLoaded(prev => ({ ...prev, objects: true }));
        console.log("COCO-SSD object detection model loaded successfully");
      } catch (objectError) {
        console.log("COCO-SSD model not available in this environment");
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
    setShowContributionModal(false);
    setCapturedImage(null);
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
          console.log("🤖 Running Roboflow gym equipment detection...");
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
      
      // Also show Roboflow detection count
      if (roboflowEquipment.length > 0) {
        console.log(`Roboflow detected ${roboflowEquipment.length} gym equipment items:`);
        roboflowEquipment.forEach((eq, idx) => {
          console.log(`  🏋️ ${eq.class}: ${(eq.score * 100).toFixed(1)}%`);
        });
      }
      
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

      // Update detected equipment with improved duplicate filtering
      setDetectedEquipment(prev => {
        const updated = [...prev];
        
        newEquipment.forEach(newEq => {
          // More strict duplicate detection - closer proximity and confidence thresholds
          const exists = updated.some(eq => 
            Math.abs(eq.position.x - newEq.position.x) < 30 &&
            Math.abs(eq.position.y - newEq.position.y) < 30 &&
            eq.name === newEq.name &&
            Math.abs(eq.confidence - newEq.confidence) < 0.15
          );
          
          if (!exists && newEq.confidence > 0.4) { // Higher confidence threshold
            updated.push(newEq);
          }
        });
        
        // Remove duplicates and keep only recent high-confidence detections
        const deduplicated = updated.filter((eq, index, arr) => {
          // Keep first occurrence of each unique equipment at each location
          return arr.findIndex(other => 
            Math.abs(other.position.x - eq.position.x) < 40 &&
            Math.abs(other.position.y - eq.position.y) < 40 &&
            other.name === eq.name
          ) === index;
        });
        
        return deduplicated
          .filter(eq => eq.confidence > 0.3)
          .slice(-12); // Limit to 12 most recent items
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
    
    // Initialize global detection state
    (window as any).detectionActive = true;
    
    console.log("Available models:", {
      pose: modelsLoaded.pose,
      objects: modelsLoaded.objects,
      poseDetector: !!poseDetectorRef.current,
      objectDetector: !!objectDetectorRef.current
    });
    
    setIsMappingMode(true);
    
    // Start capturing frames every 2 seconds for better processing
    console.log("Setting up frame capture interval...");
    
    // Use a different approach to avoid closure issues with React state
    let frameCount = 0;
    const interval = setInterval(() => {
      frameCount++;
      console.log(`⏰ Frame ${frameCount} - checking mapping status...`);
      
      // Check DOM and global state directly to avoid React closure issues
      const currentMappingState = document.querySelector('[data-mapping-active="true"]') !== null;
      const modalVisible = document.querySelector('[data-contribution-modal="true"]') !== null;
      const isDetectionActive = (window as any).detectionActive !== false;
      
      console.log("🔍 Frame", frameCount, "- Mapping:", currentMappingState, "| Modal:", modalVisible, "| Detection Active:", isDetectionActive);
      
      if (currentMappingState && !modalVisible && isDetectionActive) {
        console.log("📸 Capturing frame for AI analysis...");
        captureFrame();
      } else if (modalVisible) {
        console.log("⏸️ Detection paused - contribution modal active");
      } else if (!isDetectionActive) {
        console.log("⏸️ Detection paused - detection disabled");
      } else {
        console.log("Mapping not active, stopping interval");
        clearInterval(interval);
      }
    }, 2000);
    
    // Store interval reference for cleanup
    (window as any).mappingInterval = interval;
  };

  const handleContributionModalToggle = (isOpen: boolean) => {
    console.log("🎯 Modal toggle called:", isOpen);
    setShowContributionModal(isOpen);
    setDetectionPaused(isOpen);
    
    // Set global flag to avoid React closure issues
    (window as any).detectionActive = !isOpen;
    
    console.log(isOpen ? "🔒 AI detection paused for contribution" : "🔓 AI detection resumed");
    
    // Force update DOM attribute immediately for modal tracking
    const contributionModal = document.querySelector('[data-contribution-modal]');
    if (contributionModal) {
      contributionModal.setAttribute('data-contribution-modal', isOpen ? 'true' : 'false');
      console.log("📝 Modal DOM attribute updated:", contributionModal.getAttribute('data-contribution-modal'));
    }
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
              Start camera for AI mapping or photo contribution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isStreaming ? (
              /* Initial Choice: Camera + AI Mapping OR Camera + Contribution */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  onClick={async () => {
                    console.log("Starting Camera + AI Mapping");
                    setShowContributionModal(false); // Ensure we're NOT in contribution mode
                    await startCamera();
                    // Auto-start AI mapping after camera starts
                    setTimeout(() => {
                      if (videoRef.current && videoRef.current.srcObject) {
                        startMapping();
                      }
                    }, 1000);
                  }}
                  variant="default"
                  className="h-16 flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    <Camera className="h-4 w-4" />
                  </div>
                  <div className="text-center">
                    <div className="font-medium">Start AI Mapping</div>
                    <div className="text-xs opacity-75">Analyze gym equipment & layout</div>
                  </div>
                </Button>
                
                <Button
                  onClick={async () => {
                    console.log("Starting Camera + Contribution");
                    setIsMappingMode(false); // Ensure we're NOT in mapping mode
                    await startCamera();
                    // Show contribution modal after camera starts
                    setTimeout(() => {
                      if (videoRef.current && videoRef.current.srcObject) {
                        if (!isAuthenticated) {
                          setShowAuthModal(true);
                        } else {
                          setShowContributionModal(true);
                        }
                      }
                    }, 1000);
                  }}
                  variant="outline"
                  className="h-16 flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    <Camera className="h-4 w-4" />
                  </div>
                  <div className="text-center">
                    <div className="font-medium">Contribute Equipment Photo</div>
                    <div className="text-xs opacity-75">Help improve our AI model</div>
                  </div>
                </Button>
              </div>
            ) : (
              /* Camera Active: Show current mode and stop option */
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="font-medium">
                      {isMappingMode ? 'AI Mapping Active' : 'Camera Ready'}
                    </span>
                  </div>
                  <Button
                    onClick={stopCamera}
                    variant="destructive"
                    size="sm"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop Camera
                  </Button>
                </div>
                
                {/* Switch modes if camera is active but not in desired mode */}
                {isStreaming && !isMappingMode && !showContributionModal && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button
                      onClick={startMapping}
                      variant="default"
                      size="sm"
                      disabled={!modelsLoaded.pose && !modelsLoaded.objects}
                    >
                      <Brain className="h-4 w-4 mr-2" />
                      Start AI Mapping
                    </Button>
                    <Button
                      onClick={() => {
                        if (!isAuthenticated) {
                          setShowAuthModal(true);
                        } else {
                          setShowContributionModal(true);
                        }
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <Target className="h-4 w-4 mr-2" />
                      Contribute Photo
                    </Button>
                  </div>
                )}

                {/* Save layout button when mapping is active */}
                {isMappingMode && (
                  <Button 
                    onClick={saveGymLayout} 
                    className="w-full"
                    variant="secondary"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Save Gym Layout
                  </Button>
                )}
              </div>
            )}



            {/* Debug Info */}
            <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
              Streaming: {isStreaming ? 'Yes' : 'No'} | 
              Video Ref: {videoRef.current ? 'Ready' : 'Not Ready'} | 
              Stream Ref: {streamRef.current ? 'Active' : 'Inactive'} | 
              Mapping Mode: {isMappingMode ? 'Yes' : 'No'} | 
              Contribution Modal: {showContributionModal ? 'Yes' : 'No'}
            </div>

            {/* Video Stream Container - Always render when streaming */}
            {isStreaming && (
              <div className="space-y-4">
                {showContributionModal ? (
                  /* CONTRIBUTION MODE: Square camera view with capture interface */
                  <div className="space-y-4">
                    {!capturedImage ? (
                      /* Live camera preview for capture */
                      <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden border-2 border-blue-200">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          webkit-playsinline="true"
                          className="w-full h-full object-cover"
                          style={{ transform: 'scaleX(-1)' }}
                        />
                        
                        {/* Square crop overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-full h-full border-2 border-blue-300 border-dashed bg-blue-500/10">
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-sm bg-black/50 px-2 py-1 rounded">
                              Square Crop Area
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Captured image preview */
                      <div className="space-y-2">
                        <img 
                          src={capturedImage} 
                          alt="Captured equipment" 
                          className="w-full aspect-square object-contain rounded-lg border bg-gray-100"
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
                    )}

                    {/* Capture Button */}
                    {!capturedImage && (
                      <Button 
                        onClick={() => {
                      const canvas = document.createElement('canvas');
                      const ctx = canvas.getContext('2d');
                      if (!ctx || !videoRef.current) return;

                      const video = videoRef.current;
                      const videoWidth = video.videoWidth;
                      const videoHeight = video.videoHeight;
                      const cropSize = Math.min(videoWidth, videoHeight);
                      const cropX = (videoWidth - cropSize) / 2;
                      const cropY = (videoHeight - cropSize) / 2;

                      console.log("📱 Capture button clicked");
                      console.log("🎯 Capturing from video:", videoWidth, "x", videoHeight);
                      console.log("✂️ Crop settings:", { cropSize, cropX, cropY });
                      
                      canvas.width = cropSize;
                      canvas.height = cropSize;
                      
                      ctx.drawImage(
                        video,
                        cropX, cropY, cropSize, cropSize,
                        0, 0, cropSize, cropSize
                      );
                      
                      const imageData = canvas.toDataURL('image/jpeg', 0.8);
                      console.log("🖼️ Square image captured:", `${canvas.width}x${canvas.height}`);
                      setCapturedImage(imageData);
                    }}
                    className="w-full h-12"
                    variant="default"
                      >
                        <Camera className="h-5 w-5 mr-2" />
                        Capture Square Photo
                      </Button>
                    )}
                  </div>
                ) : (
                  /* AI MAPPING MODE: Standard video view with detection overlays */
                  <div 
                    className="relative bg-black rounded-lg overflow-hidden min-h-[240px] border-2 border-gray-300"
                    data-mapping-active={isMappingMode ? "true" : "false"}
                  >
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
                    
                    {/* Placeholder when not streaming */}
                    {!isStreaming && (
                      <div className="absolute inset-0 flex items-center justify-center text-white">
                        <div className="text-center">
                          <Video className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm opacity-75">Camera not active</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Hidden canvas for frame processing */}
            <canvas ref={canvasRef} className="hidden" />
          </CardContent>
        </Card>

        {/* Contribution Form - Show when in contribution mode and camera is active */}
        {showContributionModal && isStreaming && capturedImage && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Label Your Contribution
              </CardTitle>
              <CardDescription>
                Help our AI learn by labeling this equipment photo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Equipment Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Equipment Type *</label>
                <select 
                  value={equipmentLabel}
                  onChange={(e) => setEquipmentLabel(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  required
                >
                  <option value="">Select equipment type...</option>
                  <option value="Bench">Bench</option>
                  <option value="Dumbbell Rack">Dumbbell Rack</option>
                  <option value="Barbell">Barbell</option>
                  <option value="Squat Rack">Squat Rack</option>
                  <option value="Cable Machine">Cable Machine</option>
                  <option value="Treadmill">Treadmill</option>
                  <option value="Rowing Machine">Rowing Machine</option>
                  <option value="Pull-up Bar">Pull-up Bar</option>
                  <option value="Leg Press">Leg Press</option>
                  <option value="Smith Machine">Smith Machine</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Optional Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (Optional)</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details about this equipment..."
                  className="w-full p-2 border rounded-md h-20 resize-none"
                />
              </div>

              {/* Submit Contribution */}
              <div className="flex gap-2">
                <Button 
                  onClick={async () => {
                    if (!capturedImage || !equipmentLabel) return;
                    
                    try {
                      const contributionData = {
                        image: capturedImage,
                        equipment: equipmentLabel,
                        gymLocation: gymLocation || undefined,
                        notes: notes || undefined,
                        confidence: 1.0
                      };

                      await communityModelService.submitContribution(contributionData);
                      
                      // Reset form
                      setCapturedImage(null);
                      setEquipmentLabel("");
                      setNotes("");
                      setShowContributionModal(false);
                      
                      console.log("✅ Contribution submitted successfully");
                    } catch (error) {
                      console.error("Failed to submit contribution:", error);
                    }
                  }}
                  className="flex-1"
                  disabled={!capturedImage || !equipmentLabel}
                >
                  <Target className="h-4 w-4 mr-2" />
                  Submit Contribution
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setCapturedImage(null);
                    setEquipmentLabel("");
                    setNotes("");
                    setShowContributionModal(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detected Equipment - Only show in AI mapping mode */}
        {detectedEquipment.length > 0 && isMappingMode && (
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

        {/* Spatial Intelligence Dashboard - Only show in AI mapping mode */}
        {(equipmentZones.length > 0 || detectedPoses.length > 0) && isMappingMode && (
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
            <p>✅ Community image contribution system active</p>
            <p>✅ Quality control and crowdsourced labeling framework</p>
            <p>🔄 Next: Collect 1,000+ gym equipment photos via community</p>
            <p>🔄 Next: Train custom model from community contributions</p>
            <p>⏳ Future: Backend integration for gym layout storage</p>
            <p>⏳ Future: Community sharing and layout retrieval</p>
          </CardContent>
        </Card>
      </div>



      {/* Authentication Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => {
          console.log('User authenticated successfully');
          // Refresh contribution stats
          const stats = communityModelService.getUserStats();
          setContributionStats(stats);
          // Show contribution modal after successful auth
          setShowContributionModal(true);
        }}
      />
    </div>
  );
}