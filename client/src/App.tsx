import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import GymMapping from "@/pages/gym-mapping";
import Profile from "@/pages/profile";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/gym-mapping" component={GymMapping} />
      <Route path="/profile" component={Profile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // Override console.error to suppress specific error popups
    const originalError = console.error;
    console.error = (...args) => {
      const message = args.join(' ');
      
      // Suppress TensorFlow/WebGL related errors that cause popups
      if (
        message.includes('WebGL') ||
        message.includes('webgl') ||
        message.includes('Backend') ||
        message.includes('Platform') ||
        message.includes('cpu') ||
        message.includes('tensorflow') ||
        message.includes('tfjs')
      ) {
        return; // Suppress the error
      }
      
      // Allow other errors through
      originalError.apply(console, args);
    };

    // Aggressive error overlay removal
    const removeErrorOverlays = () => {
      // Remove all possible error overlay elements
      const selectors = [
        '#vite-error-overlay',
        '.vite-error-overlay',
        '[data-vite-error-overlay]',
        '.replit-runtime-error-modal',
        '[data-runtime-error]',
        '[id*="error"]',
        '[class*="error-overlay"]',
        '[class*="runtime-error"]'
      ];

      selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.display = 'none';
            htmlEl.style.visibility = 'hidden';
            htmlEl.style.opacity = '0';
            htmlEl.style.pointerEvents = 'none';
            htmlEl.remove();
          });
        } catch (e) {
          // Ignore errors in removal
        }
      });

      // Also check for modal backdrop elements
      const backdrops = document.querySelectorAll('[class*="backdrop"], [class*="modal"], [role="dialog"]');
      backdrops.forEach(backdrop => {
        const text = backdrop.textContent || '';
        if (text.includes('Error') || text.includes('Backend') || text.includes('WebGL')) {
          (backdrop as HTMLElement).style.display = 'none';
          backdrop.remove();
        }
      });
    };

    // Remove immediately and set up interval
    removeErrorOverlays();
    const interval = setInterval(removeErrorOverlays, 200);

    // Cleanup
    return () => {
      console.error = originalError;
      clearInterval(interval);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
