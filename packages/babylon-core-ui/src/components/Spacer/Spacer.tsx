import React from 'react';

export interface SpacerProps {
  size?: "sm" | "md" | "lg";
}

export const Spacer: React.FC<SpacerProps> = ({ size = "md" }) => {
  const sizeClasses = {
    sm: "mt-2",
    md: "mt-4",
    lg: "mt-6",
  };

  return <div className={sizeClasses[size]} />;
}; 