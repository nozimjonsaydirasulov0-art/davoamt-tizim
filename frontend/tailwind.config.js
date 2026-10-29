/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef5ff', 100: '#d9e8ff', 200: '#bcd6ff', 300: '#8ebcff', 400: '#5996ff', 500: '#336fff', 600: '#1b4ff5', 700: '#143be1', 800: '#1732b6', 900: '#19308f', 950: '#141f57' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
