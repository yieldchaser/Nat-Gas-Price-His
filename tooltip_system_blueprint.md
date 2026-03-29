# Tooltip System Architecture & Implementation Guide

This document breaks down the structure, logic, and personalization strategy of the tooltip system used in the Shipping dashboard. This system is designed to be lightweight, performant, and highly context-aware.

## 1. Architectural Overview

The system uses a **Single-Element Global Listener** pattern. Instead of attaching listeners to every tooltip-enabled element, a single event listener on the `document` handles all interactions.

### Why this works:
- **Performance**: Extremely low memory footprint regardless of the number of tooltips.
- **Dynamic Content**: Automatically works for elements added to the DOM after page load (AJAX/JS-rendered cards).
- **Centralized Styling**: One CSS block controls the look of every tooltip.

---

## 2. Component Breakdown

### A. The HTML (The "Anchor")
A single placeholder div is placed at the very end of the `<body>`.
```html
<!-- Global Tooltip Element -->
<div id="global-tooltip"></div>
```

### B. The CSS (The "Aesthetic")
Uses glassmorphism (backdrop-filter) and smooth transitions for a premium feel.
```css
#global-tooltip {
  position: fixed;
  z-index: 10000;
  background: rgba(22, 27, 34, 0.95); /* Deep dark theme */
  backdrop-filter: blur(8px);           /* Glass effect */
  color: #adbac7;                      /* Muted text */
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 280px;
  border: 1px solid rgba(88, 166, 255, 0.3); /* Subtle accent border */
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);   /* Depth */
  pointer-events: none;                /* Never blocks mouse */
  opacity: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
  transform: translateY(10px);
}

#global-tooltip.visible {
  opacity: 1;
  transform: translateY(0);
}

/* Common trigger selector */
[data-tooltip] {
  cursor: help; /* Visual cue for the user */
}
```

### C. The JavaScript (The "Logic")
The logic handles positioning, boundary detection (preventing the tooltip from going off-screen), and mobile touch support.

```javascript
(function() {
  const tooltip = document.getElementById('global-tooltip');
  let hideTimeout = null;

  document.addEventListener('mouseover', function(e) {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    
    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
    
    tooltip.textContent = text;
    tooltip.classList.add('visible');

    // POSITIONING LOGIC
    const rect = target.getBoundingClientRect();
    const GAP = 14;
    
    // Calculate center
    let left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
    let top = rect.top - tooltip.offsetHeight - GAP;

    // Flip below if not enough space at the top
    if (top < 8) top = rect.bottom + GAP;

    // Boundary checks (prevent overflow)
    if (left < 8) left = 8;
    if (left + tooltip.offsetWidth > window.innerWidth - 8) {
      left = window.innerWidth - tooltip.offsetWidth - 8;
    }

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  });

  document.addEventListener('mouseout', function(e) {
    if (e.target.closest('[data-tooltip]')) {
      hideTimeout = setTimeout(() => {
        tooltip.classList.remove('visible');
      }, 80); // Slight delay for smoother feel
    }
  });
})();
```

---

## 3. High Personalization Strategy

The "secret sauce" of this repository's tooltips is the **Contextual Mapping Layer**. Instead of hardcoding text into HTML, the content is generated from a data object (`ttMap`).

### Example Personalization Map:
In your rendering function, define a map that explains *what* the number represents, not just its name.

```javascript
const ttMap = {
  'Close': 'Market Close — the last traded price on the NYSE Arca. Watch the spread between this and NAV.',
  'Volume': 'Institutional Footprint — daily shares traded. Signals high-conviction participation.',
  'Tier': 'Participation Guardrail — sliding scale factor designed to keep trade size within the safe liquidity profile.'
};

// When rendering a card:
const label = "Volume";
const html = `<div class="stat-label" data-tooltip="${ttMap[label]}">${label}</div>`;
```

### Nature of the Tooltips:
1.  **Educational**: They don't just label; they explain the *significance* of the data (e.g., "Watch the spread between this and NAV...").
2.  **Algorithmic**: Some tooltips contain dynamic values calculated on the fly (e.g., "...defines your maximum entry capacity ($254k) for today's session").
3.  **Adaptive**: They use different language based on the asset class being viewed.

## 4. Summary for AI Agents
To replicate this in a new repo:
1.  **ID Attribute**: Use `data-tooltip` on any element.
2.  **Global UI**: Create one `#global-tooltip` div.
3.  **Delegate**: Listen for `mouseover` on `document`.
4.  **Map Logic**: Maintain a JSON-like object where keys are UI labels and values are rich, expert-level explanations.
