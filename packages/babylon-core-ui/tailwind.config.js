import defaultTheme from "tailwindcss/defaultTheme";
import { createThemes } from "tw-colors";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,css}"],
  darkMode: ["class", '[data-mode="dark"]'],
  theme: {
    fontFamily: {
      sans: ["Px Grotesk", ...defaultTheme.fontFamily.sans],
      mono: ["Px Grotesk Mono", ...defaultTheme.fontFamily.mono],
    },
    fontWeight: {
      screen: "200",
      thin: "250",
      light: "300",
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
      extrabold: "800",
      black: "900",
    },
    letterSpacing: {
      normal: "0",
      0.1: "0.1px",
      0.15: "0.15px",
      0.25: "0.25px",
      0.4: "0.4px",
      0.5: "0.5px",
      1: "1px",
    },
    extend: {
      opacity: {
        8: ".08",
        12: ".12",
        24: ".24",
        44: ".44",
      },
      keyframes: {
        "modal-in": {
          "0%": {
            transform: "scale(.96)",
            opacity: 0,
          },
          "100%": {
            transform: "scale(1)",
            opacity: 1,
          },
        },
        "modal-out": {
          "0%": {
            transform: "scale(1)",
            opacity: 1,
          },
          "100%": {
            transform: "scale(.96)",
            opacity: 0,
          },
        },
        "mobile-modal-in": {
          "0%": {
            transform: "translateY(100%)",
          },
          "100%": {
            transform: "translateY(0)",
          },
        },
        "mobile-modal-out": {
          "0%": {
            transform: "translateY(0)",
          },
          "100%": {
            transform: "translateY(100%)",
          },
        },
        "backdrop-in": {
          "0%": {
            opacity: "0",
          },
          "100%": {
            opacity: "1",
          },
        },
        "backdrop-out": {
          "0%": {
            opacity: "1",
          },
          "100%": {
            opacity: "0",
          },
        },
      },
      animation: {
        "modal-in": "modal-in 0.5s ease-in-out forwards",
        "modal-out": "modal-out 0.5s ease-in-out forwards",
        "mobile-modal-in": "mobile-modal-in 0.5s ease-in-out forwards",
        "mobile-modal-out": "mobile-modal-out 0.5s ease-in-out forwards",
        "backdrop-in": "backdrop-in 0.5s ease-in-out forwards",
        "backdrop-out": "backdrop-out 0.5s ease-in-out forwards",
      },
    },
  },
  plugins: [
    createThemes({
      light: {
        current: "currentColor",
        transparent: "transparent",
        surface: "#ffffff",
        accent: {
          primary: "#12495E",
          secondary: "#387085",
          disabled: "#9ab7c2",
          contrast: "#ffffff",
        },
        neutral: {
          100: "#F9F9F9",
          200: "#F2F2F2",
        },
        primary: {
          main: "#042F40",
          dark: "#12495E",
          light: "#387085",
          contrast: "#F5F7F2",
        },
        secondary: {
          main: "#CE6533",
          highlight: "#F9F9F9",
          contrast: "#F5F7F2",
          strokeLight: "#d7e1e7",
          strokeDark: "#387085",
        },
        error: {
          main: "#D32F2F",
          dark: "#C62828",
          light: "#EF5350",
        },
        warning: {
          main: "#EF6C00",
          dark: "#E65100",
          light: "#FF9800",
        },
        info: {
          main: "#3465CF",
          dark: "#213F82",
          light: "#34C7CF",
        },
        success: {
          main: "#2E7D32",
          dark: "#518665",
          light: "#4CAF50",
        },
      },
      dark: {
        current: "currentColor",
        transparent: "transparent",
        surface: "#202020",
        accent: {
          primary: "#F0F0F0",
          secondary: "#B0B0B0",
          disabled: "#787878",
          contrast: "#ffffff",
        },
        neutral: {
          100: "#252525",
          200: "#2C2C2C",
        },
        primary: {
          main: "#111111",
          dark: "#000000",
          light: "#387085",
          contrast: "#191919",
        },
        secondary: {
          main: "#CE6533",
          highlight: "#252525",
          contrast: "#F5F7F2",
          strokeLight: "#2F2F2F",
          strokeDark: "#5A5A5A",
        },
        error: {
          main: "#D32F2F",
          dark: "#C62828",
          light: "#EF5350",
        },
        warning: {
          main: "#EF6C00",
          dark: "#E65100",
          light: "#FF9800",
        },
        info: {
          main: "#3465CF",
          dark: "#213F82",
          light: "#34C7CF",
        },
        success: {
          main: "#2E7D32",
          dark: "#518665",
          light: "#4CAF50",
        },
      },
    }),
  ],
};
