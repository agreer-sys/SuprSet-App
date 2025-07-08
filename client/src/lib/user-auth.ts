interface User {
  id: string;
  email: string;
  name: string;
  contributions: number;
  verifiedContributions: number;
  joinedAt: number;
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
    try {
      const storedUser = localStorage.getItem('suprset_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        this.authState = {
          user,
          isAuthenticated: true
        };
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Failed to load user session:', error);
      this.clearSession();
    }
  }

  private saveSessionToStorage(user: User) {
    try {
      localStorage.setItem('suprset_user', JSON.stringify(user));
    } catch (error) {
      console.error('Failed to save user session:', error);
    }
  }

  private clearSession() {
    localStorage.removeItem('suprset_user');
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
    // Simulate account creation
    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      name,
      contributions: 0,
      verifiedContributions: 0,
      joinedAt: Date.now()
    };

    this.authState = {
      user,
      isAuthenticated: true
    };

    this.saveSessionToStorage(user);
    this.notifyListeners();
    
    console.log('User signed up:', user);
    return user;
  }

  async signIn(email: string): Promise<User | null> {
    // Simulate sign in - in real app would validate credentials
    // For now, check if user exists in localStorage with this email
    
    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      name: email.split('@')[0], // Use email prefix as name
      contributions: 0,
      verifiedContributions: 0,
      joinedAt: Date.now()
    };

    this.authState = {
      user,
      isAuthenticated: true
    };

    this.saveSessionToStorage(user);
    this.notifyListeners();
    
    console.log('User signed in:', user);
    return user;
  }

  signOut() {
    this.clearSession();
    console.log('User signed out');
  }

  updateUserStats(contributions: number, verifiedContributions: number) {
    if (this.authState.user) {
      this.authState.user.contributions = contributions;
      this.authState.user.verifiedContributions = verifiedContributions;
      this.saveSessionToStorage(this.authState.user);
      this.notifyListeners();
    }
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