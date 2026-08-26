import { useState, useEffect, useCallback } from "react";

interface UseDrawerAnimationOptions {
  isOpen: boolean;
  animationDuration?: number;
}

interface UseDrawerAnimationReturn {
  /** Whether the Portal should be mounted */
  mounted: boolean;
  /** Whether the drawer should be in the "open" visual state */
  shouldShowOpen: boolean;
  /** Callback to trigger unmount after exit animation */
  handleAnimationEnd: () => void;
}

/**
 * Custom hook for managing drawer animations with proper timing
 * Ensures Portal mounts → closed state → animate to open → animate to closed → unmount
 */
export function useDrawerAnimation({ 
  isOpen, 
}: UseDrawerAnimationOptions): UseDrawerAnimationReturn {
  const [mounted, setMounted] = useState(false);
  const [shouldShowOpen, setShouldShowOpen] = useState(false);

  // Handle opening: mount → wait for DOM → trigger open animation
  useEffect(() => {
    if (isOpen && !mounted) {
      // Step 1: Mount the Portal
      setMounted(true);
      setShouldShowOpen(false);
      
      // Step 2: Next frame, trigger the open animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShouldShowOpen(true);
        });
      });
    }
  }, [isOpen, mounted]);

  // Handle closing: trigger close animation
  useEffect(() => {
    if (!isOpen && mounted) {
      setShouldShowOpen(false);
      // Don't unmount here - wait for animation to complete
    }
  }, [isOpen, mounted]);

  // Callback for when animation completes
  const handleAnimationEnd = useCallback(() => {
    if (!isOpen && mounted) {
      // Animation finished and we're closing - unmount
      setMounted(false);
    }
  }, [isOpen, mounted]);

  return {
    mounted,
    shouldShowOpen,
    handleAnimationEnd,
  };
}