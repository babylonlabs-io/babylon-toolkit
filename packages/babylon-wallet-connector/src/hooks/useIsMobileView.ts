import { useMediaQuery } from "usehooks-ts";

// Returns true if the viewport is mobile
export const useIsMobileView = () => {
  const matches = useMediaQuery(`(max-width: 768px)`);
  return matches;
};
