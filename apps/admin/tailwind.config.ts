import type { Config } from 'tailwindcss';

const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        background: hsl('background'),
        foreground: hsl('foreground'),
        primary: { DEFAULT: hsl('primary'), foreground: hsl('primary-foreground') },
        secondary: { DEFAULT: hsl('secondary'), foreground: hsl('secondary-foreground') },
        destructive: {
          DEFAULT: hsl('destructive'),
          foreground: hsl('destructive-foreground'),
          soft: hsl('destructive-soft'),
          'soft-foreground': hsl('destructive-soft-foreground'),
        },
        muted: { DEFAULT: hsl('muted'), foreground: hsl('muted-foreground') },
        accent: {
          DEFAULT: hsl('accent'),
          foreground: hsl('accent-foreground'),
          soft: hsl('accent-soft'),
          'soft-foreground': hsl('accent-soft-foreground'),
        },
        info: { DEFAULT: hsl('info'), soft: hsl('info-soft'), 'soft-foreground': hsl('info-soft-foreground') },
        card: { DEFAULT: hsl('card'), foreground: hsl('card-foreground') },
        popover: { DEFAULT: hsl('popover'), foreground: hsl('popover-foreground') },
        sidebar: {
          DEFAULT: hsl('sidebar'),
          foreground: hsl('sidebar-foreground'),
          muted: hsl('sidebar-muted'),
          active: hsl('sidebar-active'),
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 3px)',
        sm: 'calc(var(--radius) - 6px)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        pulse_ring: { '0%': { transform: 'scale(0.8)', opacity: '0.7' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'pop-in': 'pop-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'pulse-ring': 'pulse_ring 1.6s cubic-bezier(0.2, 0.6, 0.3, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
