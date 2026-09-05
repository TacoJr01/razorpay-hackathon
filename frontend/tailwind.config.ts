import type { Config } from 'tailwindcss';

// preflight disabled: this project already has a hand-written globals.css
// design system for the /demo app; Tailwind's base reset would fight it.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
