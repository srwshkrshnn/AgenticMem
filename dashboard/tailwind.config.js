/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#eef9ff',
          100: '#d9f1ff',
          200: '#bce7ff',
          300: '#8cd9ff',
          400: '#55c4ff',
          500: '#2ea9ff',
          600: '#0e85ff',
          700: '#0069e6',
          800: '#0655b4',
          900: '#0a478d',
          950: '#082d59'
        }
      },
      boxShadow: {
        'glass': '0 4px 24px -2px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.06)'
      },
      backdropBlur: {
        'xs': '2px'
      }
    }
  },
  plugins: []
};
