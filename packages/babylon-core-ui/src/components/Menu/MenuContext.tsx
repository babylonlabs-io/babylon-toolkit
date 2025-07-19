import React, { createContext, useContext } from "react";

interface MenuContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onClose: () => void;
  isMobile: boolean;
}

const MenuContext = createContext<MenuContextValue | undefined>(undefined);

export const useMenuContext = () => {
  const context = useContext(MenuContext);
  if (!context && process.env.NODE_ENV === "development") {
    console.warn("useMenuContext must be used within a Menu component");
  }
  return context;
};

export const MenuProvider: React.FC<{
  children: React.ReactNode;
  value: MenuContextValue;
}> = ({ children, value }) => {
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
};
