/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: '#FFC107',
        'keke-yellow': '#FFC107',
        'safety-blue': '#0056D2',
        'dark-neutral': '#1E1E1E',
        'off-white': '#F5F5F5',
        success: '#34A853',
        error: '#EA4335',
        muted: '#757575',
        blue: {
          50: '#EAF2FF',
          100: '#D6E5FF',
          600: '#0056D2',
          700: '#0047B0',
        },
        green: {
          50: '#EAF6EC',
          100: '#D3EBD7',
          600: '#34A853',
          700: '#27833F',
        },
        red: {
          50: '#FDECEA',
          100: '#FAD2CF',
          600: '#EA4335',
          700: '#B3261E',
        },
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 2px 12px rgb(30 30 30 / 8%)',
        floating: '0 12px 32px rgb(30 30 30 / 14%)',
      },
    },
  },
  plugins: [],
}