/**
 * Global Tooltip Delegate Module
 * Manages hover tooltips leveraging single element triggers.
 */
window.initTooltips = function() {
    const tooltip = document.getElementById("global-tooltip");
    if (!tooltip) return;

    // Overrides CSS coordinate space fixing math discrepancies to Absolute coordinate node
    tooltip.style.position = "absolute"; 

    let activeTrigger = null;

    document.addEventListener("mouseover", (e) => {
        const trigger = e.target.closest("[data-tooltip]");
        if (!trigger) return;

        const text = trigger.getAttribute("data-tooltip");
        if (!text) return;

        activeTrigger = trigger;
        
        // Supports pre-line and safe text loads node
        tooltip.textContent = text;
        tooltip.classList.add("tooltip-visible");

        requestAnimationFrame(() => positionTooltip(trigger, tooltip));
    });

    document.addEventListener("mouseout", (e) => {
        if (activeTrigger && !activeTrigger.contains(e.relatedTarget)) {
            tooltip.classList.remove("tooltip-visible");
            activeTrigger = null;
        }
    });

    function positionTooltip(trigger, tooltip) {
        if (!activeTrigger) return;

        const rect = trigger.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        const scrollY = window.scrollY;

        // Position Math specs absolute alignment thresholds node
        const centerX = rect.left + (rect.width / 2);
        let left = centerX - (tooltipWidth / 2);
        let top = rect.top + scrollY - tooltipHeight - 14;

        // Flip fallback if offset top triggers limits bounds
        if (top < scrollY + 8) {
            top = rect.bottom + scrollY + 8;
        }

        // Clamp boundaries preventing viewport bleed nodes
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    // Mobile/Touch tap support continuous
    document.addEventListener("touchstart", (e) => {
        const trigger = e.target.closest("[data-tooltip]");
        if (trigger) {
            if (activeTrigger === trigger) {
                tooltip.classList.remove("tooltip-visible");
                activeTrigger = null;
            } else {
                activeTrigger = trigger;
                tooltip.textContent = trigger.getAttribute("data-tooltip");
                tooltip.classList.add("tooltip-visible");
                requestAnimationFrame(() => positionTooltip(trigger, tooltip));
            }
        } else {
            tooltip.classList.remove("tooltip-visible");
            activeTrigger = null;
        }
    });
};
