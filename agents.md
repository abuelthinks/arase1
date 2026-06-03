# AI Agent Guidelines & User Preferences

## UI & Design Preferences
- **Hover Animations**: The user prefers subtle color shifts (e.g., smoothly transitioning background and text colors) for hover and active states over more dramatic transformations like scaling down (`active:scale-95`) or translating. UI elements should feel professional and grounded rather than "bouncy".
- **Hover Implications**: Only apply hover states to elements that are fully interactive (clickable). Do not apply hover states to entire rows or large containers if only specific sub-elements within them are interactive, as this is misleading.
- **Hover Consistency**: When implementing hover states, transition the border color alongside the background and text color to create a unified and polished effect.

## Git Workflow
- **Commit Messages**: Always write concise but descriptive (informative) commit messages that clearly explain *what* changed and *why*, rather than just a generic summary.
