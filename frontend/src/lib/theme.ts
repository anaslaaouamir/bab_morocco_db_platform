import { createTheme } from "@mui/material/styles";

// Extend MUI Typography to include MD3 type scale variant names
declare module "@mui/material/styles" {
  interface TypographyVariants {
    displayLarge: React.CSSProperties;
    displayMedium: React.CSSProperties;
    displaySmall: React.CSSProperties;
    headlineLarge: React.CSSProperties;
    headlineMedium: React.CSSProperties;
    headlineSmall: React.CSSProperties;
    titleLarge: React.CSSProperties;
    titleMedium: React.CSSProperties;
    titleSmall: React.CSSProperties;
    bodyLarge: React.CSSProperties;
    bodyMedium: React.CSSProperties;
    bodySmall: React.CSSProperties;
    labelLarge: React.CSSProperties;
    labelMedium: React.CSSProperties;
    labelSmall: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    displayLarge?: React.CSSProperties;
    displayMedium?: React.CSSProperties;
    displaySmall?: React.CSSProperties;
    headlineLarge?: React.CSSProperties;
    headlineMedium?: React.CSSProperties;
    headlineSmall?: React.CSSProperties;
    titleLarge?: React.CSSProperties;
    titleMedium?: React.CSSProperties;
    titleSmall?: React.CSSProperties;
    bodyLarge?: React.CSSProperties;
    bodyMedium?: React.CSSProperties;
    bodySmall?: React.CSSProperties;
    labelLarge?: React.CSSProperties;
    labelMedium?: React.CSSProperties;
    labelSmall?: React.CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    displayLarge: true;
    displayMedium: true;
    displaySmall: true;
    headlineLarge: true;
    headlineMedium: true;
    headlineSmall: true;
    titleLarge: true;
    titleMedium: true;
    titleSmall: true;
    bodyLarge: true;
    bodyMedium: true;
    bodySmall: true;
    labelLarge: true;
    labelMedium: true;
    labelSmall: true;
  }
}

// Bab Morocco brand palette mapped to MD3 roles
const babMoroccoTheme = createTheme({
  cssVariables: true,
  colorSchemes: { light: true, dark: true },
  palette: {
    primary: {
      main: "#B5451B", // terracotta — couleur signature Bab Morocco
    },
    secondary: {
      main: "#1B6CA8", // bleu Atlantique
    },
    background: {
      default: "#FFFBFE",
      paper: "#F7F2FA",
    },
  },
  typography: {
    fontFamily: '"Roboto", sans-serif',
    // MD3 Type Scale
    displayLarge: { fontSize: "3.5625rem", fontWeight: 400, lineHeight: 1.13 },
    displayMedium: { fontSize: "2.8125rem", fontWeight: 400, lineHeight: 1.16 },
    displaySmall: { fontSize: "2.25rem", fontWeight: 400, lineHeight: 1.22 },
    headlineLarge: { fontSize: "2rem", fontWeight: 400, lineHeight: 1.25 },
    headlineMedium: { fontSize: "1.75rem", fontWeight: 400, lineHeight: 1.29 },
    headlineSmall: { fontSize: "1.5rem", fontWeight: 400, lineHeight: 1.33 },
    titleLarge: { fontSize: "1.375rem", fontWeight: 400, lineHeight: 1.27 },
    titleMedium: { fontSize: "1rem", fontWeight: 500, lineHeight: 1.5, letterSpacing: "0.009375em" },
    titleSmall: { fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.43, letterSpacing: "0.00625em" },
    bodyLarge: { fontSize: "1rem", fontWeight: 400, lineHeight: 1.5, letterSpacing: "0.03125em" },
    bodyMedium: { fontSize: "0.875rem", fontWeight: 400, lineHeight: 1.43, letterSpacing: "0.015625em" },
    bodySmall: { fontSize: "0.75rem", fontWeight: 400, lineHeight: 1.33, letterSpacing: "0.025em" },
    labelLarge: { fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.43, letterSpacing: "0.00625em" },
    labelMedium: { fontSize: "0.75rem", fontWeight: 500, lineHeight: 1.33, letterSpacing: "0.03125em" },
    labelSmall: { fontSize: "0.6875rem", fontWeight: 500, lineHeight: 1.45, letterSpacing: "0.03125em" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 20, textTransform: "none", fontWeight: 500 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: { borderRadius: 16 },
      },
    },
  },
});

export default babMoroccoTheme;
