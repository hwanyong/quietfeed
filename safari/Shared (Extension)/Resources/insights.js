/*
 * QuietFeed — Insights Inline Panel
 *
 * Automatically scrapes Insights data by programmatically clicking
 * "View activity" → "Insights" and renders a 2-column panel
 * next to the post content on post detail pages.
 *
 * Only activates on the post author's own posts (where "View activity" exists).
 * Disabled on mobile viewports (< 700px) where Threads uses bottom nav.
 */

const QF_PANEL_ID = 'quietfeed-insights-panel'
const QF_MOBILE_BREAKPOINT = 700

// i18n: "View activity" text in different languages
const VIEW_ACTIVITY_TEXTS = ['View activity', '활동 보기', 'アクティビティを見る', 'Ver actividad']
const INSIGHTS_TEXTS = ['Insights', '인사이트', 'インサイト']

// ── Page Detection ──

function isPostDetailPage() {
    return /^\/@[^/]+\/post\//.test(window.location.pathname)
}

function isMobileViewport() {
    return window.innerWidth < QF_MOBILE_BREAKPOINT
}

// ── Utility: wait for element ──

function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
        const existing = document.querySelector(selector)
        if (existing) return resolve(existing)

        const observer = new MutationObserver(() => {
            const found = document.querySelector(selector)
            if (!found) return
            observer.disconnect()
            resolve(found)
        })
        observer.observe(document.documentElement, { childList: true, subtree: true })
        setTimeout(() => { observer.disconnect(); resolve(null) }, timeout)
    })
}

function findTextElement(texts) {
    // Strategy 1: exact match
    for (const text of texts) {
        const found = Array.from(document.querySelectorAll('span, div, a'))
            .find(node => node.textContent.trim() == text && node.children.length <= 2)
        if (found) return found
    }
    // Strategy 2: includes match (handles "View activity >" or extra whitespace)
    for (const text of texts) {
        const found = Array.from(document.querySelectorAll('span, div, a'))
            .find(node => {
                const t = node.textContent.trim()
                return t.includes(text) && t.length < text.length + 10 && node.children.length <= 3
            })
        if (found) return found
    }
    return null
}

function waitForTextElement(texts, timeout = 10000) {
    return new Promise((resolve) => {
        const existing = findTextElement(texts)
        if (existing) return resolve(existing)

        const observer = new MutationObserver(() => {
            const found = findTextElement(texts)
            if (!found) return
            observer.disconnect()
            resolve(found)
        })
        observer.observe(document.documentElement, { childList: true, subtree: true })
        setTimeout(() => { observer.disconnect(); resolve(null) }, timeout)
    })
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms))
}

// ── Safe DOM creation (avoids Trusted Types issues) ──

function makeEl(tag, attrs, children) {
    const node = document.createElement(tag)
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (k == 'className') node.className = v
            else if (k == 'textContent') node.textContent = v
            else if (k == 'id') node.id = v
            else node.setAttribute(k, v)
        }
    }
    if (children) {
        for (const child of children) {
            if (typeof child == 'string') {
                node.appendChild(document.createTextNode(child))
            } else if (child) {
                node.appendChild(child)
            }
        }
    }
    return node
}

// ── Scraping Engine ──

async function scrapeInsights() {
    const viewActivity = await waitForTextElement(VIEW_ACTIVITY_TEXTS, 8000)
    if (!viewActivity) return null

    document.documentElement.classList.add('quietfeed-scraping')

    const clickTarget = viewActivity.closest('[role="button"]')
        || viewActivity.closest('[role="link"]')
        || viewActivity.closest('div[tabindex]')
        || viewActivity
    clickTarget.click()

    await delay(2000)
    const dialog = document.querySelector('[role="dialog"]')
    if (!dialog) {
        document.documentElement.classList.remove('quietfeed-scraping')
        return null
    }

    const data = {
        views: 0,
        likes: 0,
        viewsBreakdown: {},
        interactions: {},
        follows: 0
    }

    const dialogText = dialog.textContent
    const viewsMatch = dialogText.match(/(?:Views|조회수|조회)\s*(\d[\d,]*)/)
        || dialogText.match(/(\d[\d,]*)\s*(?:views|조회)/)
    const likesMatch = dialogText.match(/(?:Likes|좋아요)\s*(\d[\d,]*)/)
        || dialogText.match(/(\d[\d,]*)\s*(?:likes|좋아요)/)
    if (viewsMatch) data.views = parseInt(viewsMatch[1].replace(/,/g, ''))
    if (likesMatch) data.likes = parseInt(likesMatch[1].replace(/,/g, ''))

    const insightsEl = findDialogElement(dialog, INSIGHTS_TEXTS)

    if (insightsEl) {
        const insightsTarget = insightsEl.closest('[role="button"]')
            || insightsEl.closest('[role="link"]')
            || insightsEl.closest('div[tabindex]')
            || insightsEl
        insightsTarget.click()

        await delay(2000)

        const insightsDialog = document.querySelector('[role="dialog"]')
        if (insightsDialog) {
            const iText = insightsDialog.textContent

            const homeMatch = iText.match(/(?:Home|홈)\s*([\d.]+)%/)
            const otherMatch = iText.match(/(?:Other|기타)\s*([\d.]+)%/)
            const searchMatch = iText.match(/(?:Search|검색)\s*([\d.]+)%/)
            if (homeMatch) data.viewsBreakdown.home = parseFloat(homeMatch[1])
            if (otherMatch) data.viewsBreakdown.other = parseFloat(otherMatch[1])
            if (searchMatch) data.viewsBreakdown.search = parseFloat(searchMatch[1])

            const totalViewsMatch = iText.match(/(\d[\d,]*)\s*(?:Total views|총 조회수)/)
            if (totalViewsMatch) data.views = parseInt(totalViewsMatch[1].replace(/,/g, ''))

            const quotesMatch = iText.match(/(?:Quotes|인용)\s*(\d[\d,]*)/)
            const repliesMatch = iText.match(/(?:Replies|답글)\s*(\d[\d,]*)/)
            const repostsMatch = iText.match(/(?:Reposts|리포스트)\s*(\d[\d,]*)/)
            data.interactions = {
                likes: data.likes,
                quotes: quotesMatch ? parseInt(quotesMatch[1].replace(/,/g, '')) : 0,
                replies: repliesMatch ? parseInt(repliesMatch[1].replace(/,/g, '')) : 0,
                reposts: repostsMatch ? parseInt(repostsMatch[1].replace(/,/g, '')) : 0
            }

            const followsMatch = iText.match(/(?:Follows|팔로우)\s*(\d[\d,]*)/)
            if (followsMatch) data.follows = parseInt(followsMatch[1].replace(/,/g, ''))
        }
    }

    // Close dialog
    document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
    }))
    await delay(500)

    const stillOpen = document.querySelector('[role="dialog"]')
    if (stillOpen) {
        stillOpen.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
        }))
        await delay(300)
    }

    const closeBtn = document.querySelector('[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label="닫기"]')
    if (closeBtn) {
        closeBtn.click()
        await delay(300)
    }

    document.documentElement.classList.remove('quietfeed-scraping')
    return data
}

function findDialogElement(dialog, texts) {
    for (const text of texts) {
        const found = Array.from(dialog.querySelectorAll('span, div'))
            .find(node => node.textContent.trim() == text && node.children.length <= 1)
        if (found) return found
    }
    return null
}

// ── Panel Renderer (safe DOM API, no innerHTML) ──

function renderInsightsPanel(data) {
    const existing = document.getElementById(QF_PANEL_ID)
    if (existing) existing.remove()

    const totalInteractions = data.interactions.likes
        + data.interactions.quotes
        + data.interactions.replies
        + data.interactions.reposts

    const panel = makeEl('div', { id: QF_PANEL_ID }, [
        makeEl('div', { className: 'qf-panel-header' }, [
            makeEl('span', { className: 'qf-panel-icon', textContent: '📊' }),
            makeEl('span', { className: 'qf-panel-title', textContent: 'Post Insights' })
        ]),
        makeEl('div', { className: 'qf-section' }, [
            makeEl('div', { className: 'qf-section-title', textContent: 'Views' }),
            makeEl('div', { className: 'qf-big-number', textContent: data.views.toLocaleString() }),
            ...buildBreakdownBars(data.viewsBreakdown)
        ]),
        makeEl('div', { className: 'qf-divider' }),
        makeEl('div', { className: 'qf-section' }, [
            makeEl('div', { className: 'qf-section-title', textContent: 'Interactions' }),
            makeEl('div', { className: 'qf-big-number', textContent: totalInteractions.toLocaleString() }),
            buildMetricRow('♡ Likes', data.interactions.likes),
            buildMetricRow('↻ Reposts', data.interactions.reposts),
            buildMetricRow('💬 Replies', data.interactions.replies),
            buildMetricRow('❝ Quotes', data.interactions.quotes)
        ]),
        makeEl('div', { className: 'qf-divider' }),
        makeEl('div', { className: 'qf-section' }, [
            makeEl('div', { className: 'qf-section-title', textContent: 'Profile' }),
            buildMetricRow('Follows', data.follows)
        ]),
        makeEl('div', { className: 'qf-footer', textContent: 'QuietFeed · Auto-collected' })
    ])

    document.body.appendChild(panel)
}

function buildBreakdownBars(breakdown) {
    if (!breakdown.home && !breakdown.other && !breakdown.search) return []

    const items = [
        { label: 'Home', value: breakdown.home || 0 },
        { label: 'Other', value: breakdown.other || 0 },
        { label: 'Search', value: breakdown.search || 0 }
    ].filter(i => i.value > 0)

    return items.map(item => {
        const fill = makeEl('div', { className: 'qf-bar-fill' })
        fill.style.width = item.value + '%'
        return makeEl('div', { className: 'qf-bar-row' }, [
            makeEl('span', { className: 'qf-bar-label', textContent: item.label }),
            makeEl('div', { className: 'qf-bar-track' }, [fill]),
            makeEl('span', { className: 'qf-bar-value', textContent: item.value + '%' })
        ])
    })
}

function buildMetricRow(label, value) {
    return makeEl('div', { className: 'qf-metric-row' }, [
        makeEl('span', { textContent: label }),
        makeEl('span', { className: 'qf-metric-value', textContent: String(value) })
    ])
}

// ── Lifecycle ──

let currentPath = ''
let isProcessing = false

async function onPageChange() {
    const path = window.location.pathname
    if (path == currentPath) return
    currentPath = path

    if (!isPostDetailPage() || isMobileViewport()) {
        const panel = document.getElementById(QF_PANEL_ID)
        if (panel) panel.remove()
        return
    }

    if (isProcessing) return
    isProcessing = true

    await delay(2000)

    if (document.getElementById(QF_PANEL_ID)) {
        isProcessing = false
        return
    }

    const data = await scrapeInsights()
    if (data && data.views > 0) {
        renderInsightsPanel(data)
    }

    isProcessing = false
}

// ── Viewport resize: hide panel on mobile ──

window.addEventListener('resize', () => {
    if (isMobileViewport()) {
        const panel = document.getElementById(QF_PANEL_ID)
        if (panel) panel.remove()
    }
})

// ── SPA Navigation Detection ──

if (document.readyState == 'loading') {
    document.addEventListener('DOMContentLoaded', onPageChange)
} else {
    onPageChange()
}

const origPush = history.pushState
const origReplace = history.replaceState

history.pushState = function (...args) {
    origPush.apply(this, args)
    setTimeout(onPageChange, 500)
}

history.replaceState = function (...args) {
    origReplace.apply(this, args)
    setTimeout(onPageChange, 500)
}

window.addEventListener('popstate', () => setTimeout(onPageChange, 500))
