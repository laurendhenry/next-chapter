/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#eef6ff', 100: '#d9ebff', 200: '#bcdcff', 300: '#8ec5ff',
          400: '#59a4ff', 500: '#2f83f7', 600: '#1a66dc', 700: '#1652b2',
          800: '#17458d', 900: '#183c73',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
