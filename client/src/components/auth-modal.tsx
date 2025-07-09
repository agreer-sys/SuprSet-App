import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { userAuthService } from "@/lib/user-auth";
import { X, UserPlus, LogIn } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  if (!isOpen) return null;

  const handleLogin = () => {
    window.location.href = '/api/login';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
          <CardTitle>Join SuprSet Community</CardTitle>
          <CardDescription>
            Create an account to contribute photos and track your progress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Sign in with your Replit account to contribute to the community and track your progress
            </p>
            
            <Button onClick={handleLogin} className="w-full" size="lg">
              <LogIn className="h-4 w-4 mr-2" />
              Sign In with Replit
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground text-center">
            By signing in, you help build the world's most accurate gym equipment AI
          </div>
        </CardContent>
      </Card>
    </div>
  );
}