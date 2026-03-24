document.addEventListener("DOMContentLoaded", () => {
    const tooltip = document.getElementById("global-tooltip");
    if (!tooltip) return;

    let activeElement = null;

    // Mouse events
    document.addEventListener("mouseover", (e) => {
        const trigger = e.target.closest("[data-tooltip]");
        if (!trigger) return;

        activeElement = trigger;
        const text = trigger.getAttribute("data-tooltip");
        if (!text) return;

        tooltip.textContent = text;
        tooltip.classList.add("tooltip-visible");

        // Use requestAnimationFrame for sizing math accuracy
        requestAnimationFrame(() => positionTooltip(trigger, tooltip));
    });

    document.addEventListener("mouseout", (e) => {
        if (activeElement && !activeElement.contains(e.relatedTarget)) {
            tooltip.classList.remove("tooltip-visible");
            activeElement = null;
        }
    });

    // Touch Support
    document.addEventListener("touchstart", (e) => {
        const trigger = e.target.closest("[data-tooltip]");
        if (trigger) {
            // Prevent mouseover trigger immediately after touch
            if (activeElement === trigger) {
                tooltip.classList.remove("tooltip-visible");
                activeElement = null;
            } else {
                activeElement = trigger;
                tooltip.textContent = trigger.getAttribute("data-tooltip");
                tooltip.classList.add("tooltip-visible");
                requestAnimationFrame(() => positionTooltip(trigger, tooltip));
            }
        } else {
            tooltip.classList.remove("tooltip-visible");
            activeElement = null;
        }
    });

    function positionTooltip(trigger, tooltip) {
        if (!activeElement) return;

        const rect = trigger.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;

        // Position coordinates above element (Absolute style inside page wrapper)
        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        let top = rect.top + window.scrollY - tooltipHeight - 14;

        // Fallback below if not enough room above
        if (top < window.scrollY + 8) {
            top = rect.bottom + window.scrollY + 8;
        }

        // Anti-overflow left/right clamp bounding
        left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    // Dismiss tooltip on viewport resize or panel scroll to avoid orphans
    window.addEventListener("resize", () => tooltip.classList.remove("tooltip-visible"));
    document.addEventListener("scroll", (e) => {
        if (e.target.classList && e.target.classList.contains("panel")) {
            tooltip.classList.remove("tooltip-visible");
        }
    }, true);
});
