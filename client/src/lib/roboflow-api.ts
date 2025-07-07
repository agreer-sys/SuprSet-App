// Roboflow API integration for gym equipment detection
// Using the 6,620-image gym equipment dataset for specialized detection

interface RoboflowPrediction {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
  class_id: number;
  detection_id: string;
}

interface RoboflowResponse {
  time: number;
  image: {
    width: number;
    height: number;
  };
  predictions: RoboflowPrediction[];
}

export class RoboflowGymDetector {
  private apiKey: string;
  private modelEndpoint: string;

  constructor() {
    // Using the gym equipment dataset endpoint
    this.apiKey = "your-roboflow-api-key"; // Will be provided by user
    this.modelEndpoint = "https://detect.roboflow.com/gym-equipment-object-detection/1";
  }

  async detectEquipment(imageBase64: string): Promise<RoboflowPrediction[]> {
    try {
      const response = await fetch(`${this.modelEndpoint}?api_key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: imageBase64
      });

      if (!response.ok) {
        throw new Error(`Roboflow API error: ${response.status}`);
      }

      const data: RoboflowResponse = await response.json();
      return data.predictions;
    } catch (error) {
      console.error("Roboflow detection error:", error);
      return [];
    }
  }

  // Convert canvas to base64 for API submission
  canvasToBase64(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL("image/jpeg", 0.8).split(',')[1];
  }

  // Map Roboflow classes to our exercise equipment types
  mapToExerciseEquipment(roboflowClass: string): string {
    const mapping: Record<string, string> = {
      'bench': 'Flat Bench',
      'dumbbells': 'Dumbbell Set',
      'barbell': 'Barbell',
      'treadmill': 'Treadmill',
      'bike': 'Exercise Bike',
      'cable_machine': 'Cable Machine',
      'squat_rack': 'Squat Rack',
      'leg_press': 'Leg Press Machine',
      'lat_pulldown': 'Lat Pulldown Machine',
      'chest_press': 'Chest Press Machine',
      'leg_extension': 'Leg Extension Machine',
      'leg_curl': 'Leg Curl Machine',
      'smith_machine': 'Smith Machine'
    };
    
    return mapping[roboflowClass] || roboflowClass.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

export const roboflowDetector = new RoboflowGymDetector();