import { Dumbbell, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Header() {
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
          
          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <a href="#" className="text-primary font-medium">Workouts</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Exercises</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Progress</a>
            <a href="#" className="text-gray-600 hover:text-gray-900">Settings</a>
          </nav>
          
          {/* Profile */}
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600">
              <Bell className="w-4 h-4" />
            </Button>
            <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
          </div>
        </div>
      </div>
    </header>
  );
}
