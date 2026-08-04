/** @type {import('tailwindcss').Config} */
module.exports = {
  // Dark mode is driven by the `.dark-theme` class the accessibility toolbar
  // adds to <html> (see AccessibilityLoader.tsx), not the OS preference.
  darkMode: ['selector', '.dark-theme'],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Semantic colors backed by the CSS variables in globals.css. Because the
      // variables are redefined under .dark-theme, these classes swap to the
      // correct values in dark mode automatically — no `dark:` variant needed.
      colors: {
        app: 'var(--bg-primary)',
        surface: 'var(--bg-secondary)',
        card: 'var(--bg-card)',
        fg: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
        faint: 'var(--text-muted)',
        line: 'var(--border-light)',
        accent: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          border: 'var(--accent-border)',
          text: 'var(--accent-text)',
          strong: 'var(--solid-primary)',
        },
        // Status tones — each has a soft background, readable text, and border.
        // `solid` is the bright tone (dots, icons); `strong` is the dark filled
        // background used for solid badges (paired with white text).
        success: {
          DEFAULT: 'var(--text-success)',
          soft: 'var(--bg-success-light)',
          line: 'var(--border-success)',
          solid: 'var(--success)',
          strong: 'var(--solid-success)',
        },
        warning: {
          DEFAULT: 'var(--text-warning)',
          soft: 'var(--bg-warning-light)',
          line: 'var(--border-warning)',
          solid: 'var(--warning)',
          strong: 'var(--solid-warning)',
        },
        danger: {
          DEFAULT: 'var(--text-danger)',
          soft: 'var(--bg-danger-light)',
          line: 'var(--border-danger)',
          solid: 'var(--danger)',
          strong: 'var(--solid-danger)',
        },
        info: {
          DEFAULT: 'var(--text-info)',
          soft: 'var(--bg-info-light)',
          line: 'var(--border-info)',
          strong: 'var(--solid-info)',
        },
        attention: {
          DEFAULT: 'var(--text-attention)',
          soft: 'var(--bg-attention-light)',
          line: 'var(--border-attention)',
          strong: 'var(--solid-attention)',
        },
        // Neutral tone — named `subtle` to avoid clobbering Tailwind's built-in
        // `neutral` palette, which existing markup still relies on.
        subtle: {
          DEFAULT: 'var(--text-neutral)',
          soft: 'var(--bg-neutral-light)',
          line: 'var(--border-neutral)',
          strong: 'var(--solid-neutral)',
        },
      },
      // An expanding amber ring for controls that are waiting on the user —
      // draws the eye without moving the element or shifting layout.
      keyframes: {
        'cta-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(245 158 11 / 0.45)' },
          '50%': { boxShadow: '0 0 0 6px rgb(245 158 11 / 0)' },
        },
      },
      animation: {
        'cta-glow': 'cta-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
