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
        },
        // Status tones — each has a soft background, readable text, and border.
        success: {
          DEFAULT: 'var(--text-success)',
          soft: 'var(--bg-success-light)',
          line: 'var(--border-success)',
          solid: 'var(--success)',
        },
        warning: {
          DEFAULT: 'var(--text-warning)',
          soft: 'var(--bg-warning-light)',
          line: 'var(--border-warning)',
          solid: 'var(--warning)',
        },
        danger: {
          DEFAULT: 'var(--text-danger)',
          soft: 'var(--bg-danger-light)',
          line: 'var(--border-danger)',
          solid: 'var(--danger)',
        },
        info: {
          DEFAULT: 'var(--text-info)',
          soft: 'var(--bg-info-light)',
          line: 'var(--border-info)',
        },
        attention: {
          DEFAULT: 'var(--text-attention)',
          soft: 'var(--bg-attention-light)',
          line: 'var(--border-attention)',
        },
        // Neutral tone — named `subtle` to avoid clobbering Tailwind's built-in
        // `neutral` palette, which existing markup still relies on.
        subtle: {
          DEFAULT: 'var(--text-neutral)',
          soft: 'var(--bg-neutral-light)',
          line: 'var(--border-neutral)',
        },
      },
    },
  },
  plugins: [],
}
