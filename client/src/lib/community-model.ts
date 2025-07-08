// Community-driven AI model service
// Handles image contributions, quality control, and model improvement

export interface ImageContribution {
  id: string;
  userId?: string;
  image: string; // base64 encoded
  equipment: string;
  gymLocation?: string;
  notes?: string;
  confidence: number;
  timestamp: number;
  verified: boolean;
  votes: number;
  tags: string[];
}

export interface ModelMetrics {
  totalContributions: number;
  verifiedContributions: number;
  activeContributors: number;
  modelAccuracy: number;
  lastTrainingDate: number;
}

class CommunityModelService {
  private contributions: Map<string, ImageContribution> = new Map();
  private userContributions: Map<string, number> = new Map();

  // Submit a new image contribution
  async submitContribution(data: {
    image: string;
    equipment: string;
    gymLocation?: string;
    notes?: string;
    confidence: number;
  }): Promise<string> {
    const contributionId = this.generateId();
    const userId = this.getCurrentUserId(); // Would integrate with auth system
    
    const contribution: ImageContribution = {
      id: contributionId,
      userId,
      image: data.image,
      equipment: data.equipment,
      gymLocation: data.gymLocation,
      notes: data.notes,
      confidence: data.confidence,
      timestamp: Date.now(),
      verified: false,
      votes: 0,
      tags: this.extractTags(data.equipment, data.notes)
    };

    // Store contribution (in production: send to backend/database)
    this.contributions.set(contributionId, contribution);
    
    // Update user stats
    const userCount = this.userContributions.get(userId) || 0;
    this.userContributions.set(userId, userCount + 1);

    console.log(`New contribution submitted: ${data.equipment} (ID: ${contributionId})`);
    
    // In production: trigger quality control process
    await this.processContribution(contributionId);
    
    return contributionId;
  }

  // Quality control for contributions
  private async processContribution(contributionId: string) {
    const contribution = this.contributions.get(contributionId);
    if (!contribution) return;

    // Simulate quality checks
    const qualityScore = await this.assessImageQuality(contribution.image);
    const labelAccuracy = await this.validateEquipmentLabel(contribution);
    
    // Auto-verify high-quality contributions
    if (qualityScore > 0.8 && labelAccuracy > 0.9) {
      contribution.verified = true;
      contribution.votes = 5; // Boost verified contributions
      console.log(`Auto-verified contribution: ${contributionId}`);
    }

    // In production: send to crowd-sourcing platform for manual review
    this.contributions.set(contributionId, contribution);
  }

  // Assess image quality (blur, lighting, clarity)
  private async assessImageQuality(imageBase64: string): Promise<number> {
    // In production: use image analysis API or computer vision
    // For now, simulate quality assessment
    const randomQuality = Math.random() * 0.4 + 0.6; // 0.6-1.0 range
    return randomQuality;
  }

  // Validate equipment labeling accuracy
  private async validateEquipmentLabel(contribution: ImageContribution): Promise<number> {
    // In production: use existing AI models to cross-validate
    // Compare user label with AI prediction
    const commonEquipment = [
      'bench press', 'squat rack', 'cable machine', 'lat pulldown',
      'leg press', 'dumbbells', 'barbell', 'smith machine'
    ];
    
    const normalizedLabel = contribution.equipment.toLowerCase();
    const isCommonEquipment = commonEquipment.some(eq => 
      normalizedLabel.includes(eq.toLowerCase())
    );
    
    return isCommonEquipment ? 0.9 : 0.7;
  }

  // Extract relevant tags from equipment and notes
  private extractTags(equipment: string, notes?: string): string[] {
    const tags: string[] = [];
    
    // Equipment-based tags
    if (equipment.toLowerCase().includes('bench')) tags.push('bench');
    if (equipment.toLowerCase().includes('squat')) tags.push('legs');
    if (equipment.toLowerCase().includes('cable')) tags.push('cables');
    if (equipment.toLowerCase().includes('cardio')) tags.push('cardio');
    
    // Notes-based tags
    if (notes) {
      if (notes.toLowerCase().includes('busy')) tags.push('crowded');
      if (notes.toLowerCase().includes('new')) tags.push('new-equipment');
      if (notes.toLowerCase().includes('broken')) tags.push('maintenance');
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }

  // Get model performance metrics
  getModelMetrics(): ModelMetrics {
    const totalContributions = this.contributions.size;
    const verifiedContributions = Array.from(this.contributions.values())
      .filter(c => c.verified).length;
    const activeContributors = this.userContributions.size;
    
    // Calculate model accuracy based on verified contributions
    const modelAccuracy = totalContributions > 0 ? 
      (verifiedContributions / totalContributions) * 0.9 + 0.1 : 0.7;

    return {
      totalContributions,
      verifiedContributions,
      activeContributors,
      modelAccuracy,
      lastTrainingDate: Date.now() - (7 * 24 * 60 * 60 * 1000) // 7 days ago
    };
  }

  // Get user's contribution statistics
  getUserStats(userId?: string): { contributionCount: number; verifiedCount: number } {
    const targetUserId = userId || this.getCurrentUserId();
    const userContributions = Array.from(this.contributions.values())
      .filter(c => c.userId === targetUserId);
    
    return {
      contributionCount: userContributions.length,
      verifiedCount: userContributions.filter(c => c.verified).length
    };
  }

  // Get recent contributions for display
  getRecentContributions(limit: number = 10): ImageContribution[] {
    return Array.from(this.contributions.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Helper methods
  private generateId(): string {
    return `contrib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentUserId(): string {
    // In production: get from auth context
    return `user_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Export contributions for model training
  async exportTrainingData(): Promise<ImageContribution[]> {
    const verifiedContributions = Array.from(this.contributions.values())
      .filter(c => c.verified && c.votes >= 3);
    
    console.log(`Exporting ${verifiedContributions.length} verified contributions for training`);
    return verifiedContributions;
  }
}

export const communityModelService = new CommunityModelService();