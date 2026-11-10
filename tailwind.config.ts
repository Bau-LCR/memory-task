import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0B1F3A', 800: '#12294A' },
        brand: { DEFAULT: '#1D4ED8', 600: '#2563EB' },
      },
    },
  },
  plugins: [],
} satisfies Config
