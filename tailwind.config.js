/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#12121f',
          900: '#1a1a2e',
          800: '#232340',
          700: '#2e2e52',
          600: '#3c3c68',
        },
        accent: {
          DEFAULT: '#4f8cff',
          hover: '#3b78ec',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Ubuntu', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
