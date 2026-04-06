import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // base-nova buttons use rounded-4xl (pill shape)
        "4xl": "2rem",
      },
      ringWidth: {
        // base-nova uses ring-3 for focus rings
        "3": "3px",
      },
    },
  },
  plugins: [
    // Polyfill the Tailwind v4 @custom-variant definitions from shadcn/tailwind.css
    // so data-checked:*, data-unchecked:*, etc. work in Tailwind v3.
    plugin(({ addVariant }) => {
      addVariant("data-checked", [
        "&[data-state='checked']",
        "&[data-checked]:not([data-checked='false'])",
      ]);
      addVariant("data-unchecked", [
        "&[data-state='unchecked']",
        "&[data-unchecked]:not([data-unchecked='false'])",
      ]);
      addVariant("data-disabled", [
        "&[data-disabled='true']",
        "&[data-disabled]:not([data-disabled='false'])",
      ]);
      addVariant("data-open", [
        "&[data-state='open']",
        "&[data-open]:not([data-open='false'])",
      ]);
      addVariant("data-closed", [
        "&[data-state='closed']",
        "&[data-closed]:not([data-closed='false'])",
      ]);
      addVariant("data-selected", ["&[data-selected='true']"]);
      addVariant("data-active", [
        "&[data-state='active']",
        "&[data-active]:not([data-active='false'])",
      ]);
    }),
  ],
};

export default config;
