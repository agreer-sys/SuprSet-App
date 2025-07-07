import { Dumbbell, Bell, Camera, Home, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useState } from "react";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  
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
                Workouts
              </Button>
            </Link>
            <Link href="/gym-mapping">
              <Button 
                variant={location === "/gym-mapping" ? "default" : "ghost"} 
                size="sm"
                className="flex items-center gap-2"
              >
                <Camera className="h-4 w-4" />
                Gym Mapping
              </Button>
            </Link>
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
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600">
              <Bell className="w-4 h-4" />
            </Button>
            <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
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
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
