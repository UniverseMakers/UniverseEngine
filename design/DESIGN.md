# Design System Document

## 1. Overview & Creative North Star
### The Creative North Star: "The Celestial Observer"
This design system is engineered for the Royal Society Summer Science Exhibition, translating complex astrophysical simulations into an intuitive, high-end laboratory interface. It rejects the "web-page" aesthetic in favor of a **Heads-Up Display (HUD)** feel—an immersive, glass-layered environment where the user isn't just a visitor, but an operator of sophisticated scientific machinery.

The system breaks away from standard rigid grids through **intentional depth and atmospheric layering**. Elements do not simply sit "on" the screen; they float within the cosmos. By using varying levels of translucency, high-contrast typography scales, and a signature "Glass" default state, the system provides a tactile, premium experience that commands authority and precision.

---

## 2. Colors
The palette is rooted in deep space blacks and high-precision blues, designed to recede and allow the scientific data to take center stage.

*   **Primary (#b4c5ff / #2563EB):** Reserved for high-action states and the "RUN" sequence.
*   **Surface Hierarchy:** We utilize `surface_container` tiers to create a "Nested Glass" effect.
    *   **Surface Lowest (#0e0e11):** The deep background of the cosmos.
    *   **Surface Low (#1b1b1e):** Base for the main control panels.
    *   **Surface High (#2a2a2d):** Nested interactive zones (e.g., slider tracks).

### The "No-Line" Rule
Standard 1px borders are strictly prohibited for defining sections. Layout boundaries must be established through background color shifts (e.g., a `surface-container-high` field nested within a `surface-container-low` panel) or subtle tonal transitions.

### The "Glass & Gradient" Rule
To achieve the "signature" feel, floating control panels must utilize `backdrop-blur` (12px to 20px) and a semi-transparent surface color. For the primary 'RUN' button, use a subtle radial gradient transitioning from `primary` to `primary_container` to give it a physical, backlit glow.

---

## 3. Typography
The system employs a dual-typeface strategy to balance editorial elegance with technical precision.

*   **Display & Headlines (Space Grotesk):** An authoritative, wide-tracking sans-serif used for panel titles and cosmic scales. It conveys a "NASA-spec" modernist aesthetic. 
*   **Body & Data (Inter / Monospace):** Inter provides high-legibility for UI labels, while a high-tech monospaced variant is used exclusively for numeric readouts (e.g., mass, velocity, time). 

**Hierarchy Strategy:**
*   **headline-sm (1.5rem):** Used for panel titles (e.g., "PLANETARY PARAMETERS") with 10% letter-spacing and uppercase styling.
*   **label-md (0.75rem):** Used for unit notations (e.g., $M_{\oplus}$, $km/s$). This should be set in `on_surface_variant` to maintain secondary importance.

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering** rather than drop shadows.

*   **The Layering Principle:** Stack `surface-container` tiers to create a soft lift. A floating card should be `surface-container-low` with a 20% opacity `outline-variant` to catch the "light" of the simulation.
*   **Ambient Shadows:** For floating panels, use a ultra-diffused shadow: `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);`. No hard edges.
*   **The "Ghost Border":** If a perimeter is required for focus, use the `outline-variant` at 15% opacity. This creates a "etched glass" effect rather than a heavy stroke.
*   **Atmospheric Blur:** All floating panels must use a backdrop blur to integrate the UI with the celestial background, preventing it from feeling "pasted on."

---

## 5. Components

### Floating Control Panels (Glassmorphism)
*   **Style:** `surface_container_low` at 80% opacity + `backdrop-filter: blur(16px)`.
*   **Corner Radius:** `lg` (0.5rem) for a modern, hardware-manufactured feel.

### Precision Sliders
*   **Track:** `surface_container_highest` with a height of 2px.
*   **Thumb:** A solid `on_primary` circle with a subtle `primary` outer glow.
*   **Integrated Field:** Numeric readouts appear in a nested `surface_container_high` box to the right of the slider, utilizing monospaced typography.

### The 'RUN' Trigger
*   **Visuals:** Large, `primary` filled button with a `full` roundedness. 
*   **Interaction:** On hover, the button should gain a 4px `primary` outer glow. It must feel like a physical, illuminated switch found in a high-end lab.
*   **Typography:** `title-md` (Inter), bold, centered.

### Timeline Scrubber
*   **Location:** Fixed to the bottom viewport.
*   **Style:** A slim, full-width glass bar (`surface_container_lowest` at 60% opacity).
*   **Interaction:** Subtle vertical growth on hover; the thumb displays the current 't =' value in real-time.

---

## 6. Style Themes (The Five Identities)

This design system supports five thematic overrides while maintaining the structural tokens:

1.  **Glass (Default):** Use `surface-tint` (blue) accents. High transparency.
2.  **Matrix:** Swap `primary` to #00FF41. Replace UI sans with Monospace. Add 1px scanline textures to glass panels.
3.  **HAL 9000:** Swap `primary` to #FF0000. Set all backgrounds to absolute `#000000`. Use circular masking on all icons.
4.  **Nostromo:** Swap `primary` to Amber (#FFB000). Increase `outline` opacity to 40% for a "rugged" look. Use condensed typography.
5.  **Tron:** Use `tertiary` (#7bd0ff) for all borders at 80% opacity. Add inner-glow to all panels.

---

## 7. Do's and Don'ts

### Do
*   **Do** use `spacing-8` (2rem) between major control groups to allow the data to breathe.
*   **Do** use `on_surface_variant` for helper text to ensure the main data points (white) pop.
*   **Do** align all numeric readouts to a monospaced grid for scientific "honesty."

### Don'ts
*   **Don't** use solid black borders or dividers; use a `spacing-1` gap or background shift instead.
*   **Don't** use standard "drop shadows" with 0 blur. Shadows must be ambient and atmospheric.
*   **Don't** mix themes within a single view. The user must feel fully immersed in one "interface era" at a time.