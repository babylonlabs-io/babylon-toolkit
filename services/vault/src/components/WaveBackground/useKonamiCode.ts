import { useEffect, useState } from "react";

const KONAMI_CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
];

export function useKonamiCode(): boolean {
  const [isActivated, setIsActivated] = useState(false);

  useEffect(() => {
    let sequence: string[] = [];

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.code;
      
      sequence = [...sequence, key].slice(-KONAMI_CODE.length);
      
      if (sequence.length === KONAMI_CODE.length) {
        const matches = sequence.every(
          (k, index) => k === KONAMI_CODE[index]
        );
        
        if (matches) {
          setIsActivated(true);
          sequence = [];
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return isActivated;
}

