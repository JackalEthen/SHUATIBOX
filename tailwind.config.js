/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','"Segoe UI"','"Microsoft YaHei"','"Noto Sans CJK SC"','sans-serif'],
        serif: ['"Songti SC"','"STSong"','"SimSun"','"Noto Serif CJK SC"','serif'],
      },
    },
  },
  plugins: [],
};
