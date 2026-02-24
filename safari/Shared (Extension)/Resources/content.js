/*
 * QuietFeed — Content Script for Threads.com
 *
 * Redirects the home feed (threads.com/) to the user's profile page.
 * Automatically detects the logged-in user's profile ID from the sidebar.
 * Handles SPA navigation via History API monitoring.
 * Can be toggled on/off via the popup.
 */

let profileId = null
let enabled = true

// ── Profile Detection Strategies ──

// Strategy 1: Last sidebar nav link with /@pattern (language-independent)
function getProfileFromLastNavLink() {
    const links = document.querySelectorAll('a[role="link"][tabindex="0"]')
    for (let i = links.length - 1; i >= 0; i--) {
        const href = links[i].getAttribute('href')
        if (href && href.startsWith('/@')) return href.replace('/@', '')
    }
    return null
}

// Strategy 2: Profile SVG parent link (auxiliary)
function getProfileFromSvgParent() {
    const svgs = document.querySelectorAll('svg[aria-label]')
    for (const svg of svgs) {
        const link = svg.closest('a[href^="/@"]')
        if (link) return link.getAttribute('href').replace('/@', '')
    }
    return null
}

// Strategy 3: Relay Store SSR data
function getProfileFromRelayStore() {
    const scripts = document.querySelectorAll('script[type="application/json"]')
    for (const script of scripts) {
        const text = script.textContent || ''
        const match = text.match(/"username":"([^"]+)"/)
        if (match) return match[1]
    }
    return null
}

// Combined detection: try all strategies in priority order
function detectProfileId() {
    return getProfileFromLastNavLink()
        || getProfileFromSvgParent()
        || getProfileFromRelayStore()
        || null
}

// ── Core Functions ──

function isHomePage() {
    const path = window.location.pathname
    return path == '/' || path == ''
}

function redirectToProfile() {
    if (!enabled) return
    if (!isHomePage()) return
    if (!profileId) return
    window.location.replace(`https://www.threads.com/@${profileId}`)
}

// ── CSS Toggle ──
// quietfeed.css is always injected via manifest, so we toggle via body class

function applyCssState() {
    if (enabled) {
        document.documentElement.classList.remove('quietfeed-disabled')
    } else {
        document.documentElement.classList.add('quietfeed-disabled')
    }
}

// ── Storage Helpers ──

async function loadSettings() {
    const result = await browser.storage.local.get(['profileId', 'enabled'])
    profileId = result.profileId || null
    // Default to enabled if not set
    enabled = result.enabled !== false
    return { profileId, enabled }
}

async function cacheProfileId(id) {
    await browser.storage.local.set({ profileId: id })
}

// ── Initialization ──

async function init() {
    // Phase 1: Load settings and apply immediately
    await loadSettings()
    applyCssState()

    if (enabled && profileId) {
        redirectToProfile()
    }

    // Phase 2: Watch DOM for sidebar to appear, then auto-detect
    if (enabled) {
        waitForSidebar()
    }
}

function waitForSidebar() {
    // Immediate check
    const detected = detectProfileId()
    if (detected) {
        onProfileDetected(detected)
        return
    }

    // Watch for DOM changes
    const observer = new MutationObserver(() => {
        const detected = detectProfileId()
        if (!detected) return
        observer.disconnect()
        onProfileDetected(detected)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    // Timeout after 15 seconds
    setTimeout(() => observer.disconnect(), 15000)
}

async function onProfileDetected(detected) {
    if (detected != profileId) {
        profileId = detected
        await cacheProfileId(detected)
    }
    redirectToProfile()
}

// ── Listen for setting changes from popup ──

browser.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
        enabled = changes.enabled.newValue !== false
        applyCssState()
        if (enabled) {
            redirectToProfile()
            waitForSidebar()
        }
    }
    if (changes.profileId) {
        profileId = changes.profileId.newValue || null
        if (enabled) redirectToProfile()
    }
})

// ── Start ──
init()

// ── SPA navigation handling ──

const originalPushState = history.pushState
const originalReplaceState = history.replaceState

history.pushState = function (...args) {
    originalPushState.apply(this, args)
    redirectToProfile()
}

history.replaceState = function (...args) {
    originalReplaceState.apply(this, args)
    redirectToProfile()
}

window.addEventListener('popstate', () => {
    redirectToProfile()
})
