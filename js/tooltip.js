/**
 * TOOLTIP SYSTEM (tooltip.js)
 * 
 * Event delegation-based tooltip system.
 * Any element with data-tooltip="..." attribute automatically gets tooltips.
 * Global tooltip div at end of body handles all positioning & display.
 */

function initTooltips() {
    const tooltip = document.getElementById('global-tooltip')
    if (!tooltip) {
        console.error('[Tooltip] #global-tooltip not found')
        return
    }

    /**
     * Position tooltip relative to trigger element
     * Center above, flip to below if not enough room, clamp horizontally
     */
    function positionTooltip(trigger) {
        const rect = trigger.getBoundingClientRect()
        
        // Center horizontally over trigger
        const centerX = rect.left + rect.width / 2
        let left = centerX - tooltip.offsetWidth / 2
        let top = rect.top + window.scrollY - tooltip.offsetHeight - 14
        
        // Flip to below if not enough room above (8px margin)
        if (top - window.scrollY < 8) {
            top = rect.bottom + window.scrollY + 8
        }
        
        // Anti-overflow horizontal clamp (8px margin on sides)
        left = Math.max(8, Math.min(left, window.innerWidth - tooltip.offsetWidth - 8))
        
        tooltip.style.left = left + 'px'
        tooltip.style.top = top + 'px'
    }

    /**
     * Mouse events: hover over any element with data-tooltip
     */
    document.addEventListener('mouseover', e => {
        const trigger = e.target.closest('[data-tooltip]')
        if (!trigger) return
        
        tooltip.textContent = trigger.dataset.tooltip
        tooltip.classList.add('tooltip-visible')
        
        // Wait one frame before measuring offsetWidth (CSS class just added)
        requestAnimationFrame(() => positionTooltip(trigger))
    })

    document.addEventListener('mouseout', e => {
        const trigger = e.target.closest('[data-tooltip]')
        if (!trigger) return
        tooltip.classList.remove('tooltip-visible')
    })

    /**
     * Touch events: tap to show, tap elsewhere to hide
     */
    document.addEventListener('touchstart', e => {
        const trigger = e.target.closest('[data-tooltip]')
        
        if (!trigger) {
            // Tapped outside any tooltip element → hide
            tooltip.classList.remove('tooltip-visible')
            return
        }
        
        // Tapped on a tooltip element → show it
        tooltip.textContent = trigger.dataset.tooltip
        tooltip.classList.add('tooltip-visible')
        requestAnimationFrame(() => positionTooltip(trigger))
    }, { passive: true })
}
