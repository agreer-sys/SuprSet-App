import { Dumbbell, Bell, Camera, Home, Menu, User, LogOut, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  
  const signOut = () => {
    window.location.href = '/api/logout';
  };
  
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Dumbbell className="text-primary-foreground w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">SuprSet</h1>
          </div>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-4">
            <Link href="/">
              <Button 
                variant={location === "/" ? "default" : "ghost"} 
                size="sm"
                className="flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Home
              </Button>
            </Link>
            
            {isAuthenticated && (
              <>
                <Link href="/supersets">
                  <Button 
                    variant={location === "/supersets" ? "default" : "ghost"} 
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Dumbbell className="h-4 w-4" />
                    Super Sets
                  </Button>
                </Link>
                <Link href="/workouts">
                  <Button 
                    variant={location === "/workouts" ? "default" : "ghost"} 
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Home className="h-4 w-4" />
                    Workouts
                  </Button>
                </Link>
                <Link href="/trainer-pairs">
                  <Button 
                    variant={location === "/trainer-pairs" ? "default" : "ghost"} 
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Dumbbell className="h-4 w-4" />
                    Trainer Pairs
                  </Button>
                </Link>
              </>
            )}
            
            <Link href="/gym-mapping">
              <Button 
                variant={location === "/gym-mapping" ? "default" : "ghost"} 
                size="sm"
                className="flex items-center gap-2"
              >
                <Camera className="h-4 w-4" />
                AI Mapping
              </Button>
            </Link>
            
            {isAuthenticated && (
              <Link href="/batch-contribute">
                <Button 
                  variant={location === "/batch-contribute" ? "default" : "ghost"} 
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Batch Upload
                </Button>
              </Link>
            )}
          </nav>
          
          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-400 hover:text-gray-600"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Desktop Profile */}
          <div className="hidden md:flex items-center space-x-3">
            {isAuthenticated ? (
              <>
                <div className="flex items-center space-x-2">
                  <Link href="/profile">
                    <div className="flex items-center space-x-2 cursor-pointer hover:opacity-80">
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {user?.firstName || user?.email?.split('@')[0] || 'User'}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          Authenticated
                        </Badge>
                      </div>
                      <User className="w-4 h-4 text-gray-400" />
                    </div>
                  </Link>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={signOut}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.href = '/api/login'}
                  className="flex items-center gap-2"
                >
                  <User className="w-4 h-4" />
                  Sign In
                </Button>
              </div>
            )}
          </div>
        </div>
        
        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200">
            <nav className="flex flex-col space-y-2">
              <Link href="/">
                <Button 
                  variant={location === "/" ? "default" : "ghost"} 
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Home className="h-4 w-4" />
                  Workouts
                </Button>
              </Link>
              <Link href="/gym-mapping">
                <Button 
                  variant={location === "/gym-mapping" ? "default" : "ghost"} 
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Camera className="h-4 w-4" />
                  Gym Mapping
                </Button>
              </Link>
              
              {isAuthenticated && (
                <Link href="/batch-contribute">
                  <Button 
                    variant={location === "/batch-contribute" ? "default" : "ghost"} 
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <Upload className="h-4 w-4" />
                    Batch Upload
                  </Button>
                </Link>
              )}
              
              {/* Mobile Authentication */}
              <div className="pt-2 border-t border-gray-100">
                {isAuthenticated ? (
                  <>
                    <Link href="/profile">
                      <Button 
                        variant={location === "/profile" ? "default" : "ghost"} 
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <User className="h-4 w-4" />
                        Profile
                      </Button>
                    </Link>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="w-full justify-start gap-2 text-red-600 hover:text-red-700"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        signOut();
                      }}
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      window.location.href = '/api/login';
                    }}
                  >
                    <User className="h-4 w-4" />
                    Sign In
                  </Button>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
