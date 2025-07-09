import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Mail, 
  Calendar, 
  Camera, 
  Trophy, 
  Users, 
  BarChart3,
  LogOut,
  ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import Header from "@/components/header";
import { useQuery } from "@tanstack/react-query";

export default function Profile() {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // Fetch contribution stats
  const { data: contributionStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/contributions/stats"],
    enabled: isAuthenticated && !!user,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="text-center py-8">
              <User className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h2 className="text-lg font-semibold mb-2">Please sign in to view your profile</h2>
              <p className="text-gray-600 mb-4">
                Sign in to track your contributions and access personalized features
              </p>
              <Button onClick={() => window.location.href = '/api/login'}>
                Sign In with Replit
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const userInitials = user.firstName && user.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user.email?.[0]?.toUpperCase() || 'U';

  const displayName = user.firstName 
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : user.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Navigation */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
                <AvatarFallback className="text-lg">{userInitials}</AvatarFallback>
              </Avatar>
              
              <div className="text-center md:text-left flex-1">
                <h1 className="text-2xl font-bold mb-2">{displayName}</h1>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  <Badge variant="secondary" className="gap-1">
                    <Mail className="h-3 w-3" />
                    {user.email || 'No email'}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Calendar className="h-3 w-3" />
                    Joined {new Date(user.createdAt).toLocaleDateString()}
                  </Badge>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => window.location.href = '/api/logout'}
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Contributions</CardTitle>
              <Camera className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {statsLoading ? "..." : (contributionStats?.total || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Photos contributed for AI training
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {statsLoading ? "..." : (contributionStats?.verified || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Quality-approved contributions
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Impact Score</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {statsLoading ? "..." : contributionStats ? Math.round((contributionStats.verified / Math.max(contributionStats.total, 1)) * 100) + "%" : "0%"}
              </div>
              <p className="text-xs text-muted-foreground">
                Approval rate for contributions
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Your latest contributions to the SuprSet community
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-gray-500">
              <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">No activity yet</p>
              <p className="text-sm">
                Start by visiting the Gym Mapping page to contribute photos of gym equipment
              </p>
              <Link href="/gym-mapping">
                <Button className="mt-4" variant="outline">
                  <Camera className="h-4 w-4 mr-2" />
                  Start Contributing
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Your account details are managed through Replit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">User ID</label>
                <p className="text-sm text-gray-900 font-mono">{user.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Last Updated</label>
                <p className="text-sm text-gray-900">
                  {new Date(user.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            
            <Separator />
            
            <div className="text-sm text-gray-600">
              <p className="mb-2">
                <strong>Data Privacy:</strong> Your profile information is securely stored and only used to 
                enhance your SuprSet experience.
              </p>
              <p>
                <strong>Contributions:</strong> All gym equipment photos you contribute help build a 
                community-driven AI model while maintaining your privacy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}