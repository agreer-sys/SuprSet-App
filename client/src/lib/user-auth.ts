interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

class UserAuthService {
  private authState: AuthState = {
    user: null,
    isAuthenticated: false
  };
  
  private listeners: Array<(state: AuthState) => void> = [];

  constructor() {
    // Check for existing session on init
    this.loadSessionFromStorage();
  }

  private loadSessionFromStorage() {
    // Check if user is authenticated via API
    this.checkAuthStatus();
  }

  private async checkAuthStatus() {
    try {
      const response = await fetch('/api/auth/user', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const user = await response.json();
        this.authState = {
          user,
          isAuthenticated: true
        };
      } else {
        this.authState = {
          user: null,
          isAuthenticated: false
        };
      }
    } catch (error) {
      this.authState = {
        user: null,
        isAuthenticated: false
      };
    }
    
    this.notifyListeners();
  }

  private saveSessionToStorage(user: User) {
    // No longer needed - session is handled server-side
  }

  private clearSession() {
    this.authState = {
      user: null,
      isAuthenticated: false
    };
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.authState));
  }

  subscribe(listener: (state: AuthState) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  getAuthState(): AuthState {
    return { ...this.authState };
  }

  async signUp(email: string, name: string): Promise<User> {
    // Redirect to Replit Auth login
    window.location.href = '/api/login';
    throw new Error('Redirecting to login');
  }

  async signIn(email: string): Promise<User | null> {
    // Redirect to Replit Auth login
    window.location.href = '/api/login';
    throw new Error('Redirecting to login');
  }

  signOut() {
    window.location.href = '/api/logout';
  }

  updateUserStats(contributions: number, verifiedContributions: number) {
    // User stats are now handled server-side with real authentication
    // This method is kept for backward compatibility but does nothing
    console.log('User stats updated:', { contributions, verifiedContributions });
  }

  getCurrentUser(): User | null {
    return this.authState.user;
  }

  isSignedIn(): boolean {
    return this.authState.isAuthenticated;
  }
}

export const userAuthService = new UserAuthService();
export type { User, AuthState };