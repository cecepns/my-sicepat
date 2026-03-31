/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#e01e37',
          navy: '#11295a',
          soft: '#f6f8fc',
        },
      },
    },
  },
  plugins: [],
}
