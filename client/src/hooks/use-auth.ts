import { useState, useEffect } from "react";
import { userAuthService, type AuthState } from "@/lib/user-auth";

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>(() => 
    userAuthService.getAuthState()
  );

  useEffect(() => {
    return userAuthService.subscribe(setAuthState);
  }, []);

  return {
    user: authState.user,
    isAuthenticated: authState.isAuthenticated,
    signOut: () => userAuthService.signOut(),
    updateUserStats: (contributions: number, verified: number) => 
      userAuthService.updateUserStats(contributions, verified)
  };
}