import type { Config } from 'tailwindcss'

const config: Config = {
  // Include @guardian/ui components in content scanning
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // CRITICAL: Include UI package components to prevent class purging
    '../../packages/ui/components/**/*.{jsx,tsx}',
  ],
  
  // Use Guardian UI preset
  presets: [
    require('../../packages/ui/tailwind-preset.js')
  ],
  
  theme: {
    extend: {
      // App-specific extensions
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
export default config
