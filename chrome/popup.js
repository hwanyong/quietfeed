/*
 * QuietFeed — Popup Script (Chrome)
 *
 * Displays current profile ID from storage.
 * Allows manual input as fallback when auto-detection fails.
 * Provides enable/disable toggle for the extension.
 */

const profileValue = document.getElementById('profileValue')
const statusDot = document.getElementById('statusDot')
const statusText = document.getElementById('statusText')
const profileInfo = document.getElementById('profileInfo')
const manualInput = document.getElementById('manualInput')
const profileInput = document.getElementById('profileInput')
const saveBtn = document.getElementById('saveBtn')
const resetBtn = document.getElementById('resetBtn')
const enableToggle = document.getElementById('enableToggle')

async function loadState() {
    const result = await chrome.storage.local.get(['profileId', 'enabled'])
    const id = result.profileId || null
    const isEnabled = result.enabled !== false

    enableToggle.checked = isEnabled

    if (!id) {
        showNoProfile()
        return
    }

    showActiveProfile(id, isEnabled)
}

function showActiveProfile(id, isEnabled) {
    profileValue.textContent = `@${id}`
    profileInfo.style.display = ''
    manualInput.style.display = 'none'
    resetBtn.style.display = ''

    if (isEnabled) {
        statusDot.className = 'dot active'
        statusText.textContent = 'Active on Threads'
    } else {
        statusDot.className = 'dot'
        statusText.textContent = 'Paused'
    }
}

function showNoProfile() {
    profileValue.textContent = '—'
    statusDot.className = 'dot'
    statusText.textContent = 'No profile detected'
    manualInput.style.display = ''
    resetBtn.style.display = 'none'
}

// ── Toggle enable/disable ──

enableToggle.addEventListener('change', async () => {
    const isEnabled = enableToggle.checked
    await chrome.storage.local.set({ enabled: isEnabled })

    const result = await chrome.storage.local.get('profileId')
    const id = result.profileId || null
    if (id) {
        showActiveProfile(id, isEnabled)
    }
})

// ── Save manual profile ──

saveBtn.addEventListener('click', async () => {
    const raw = profileInput.value.trim().replace(/^@/, '')
    if (!raw) return
    await chrome.storage.local.set({ profileId: raw })
    showActiveProfile(raw, enableToggle.checked)
    profileInput.value = ''
})

profileInput.addEventListener('keydown', (e) => {
    if (e.key == 'Enter') saveBtn.click()
})

// ── Reset ──

resetBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove('profileId')
    showNoProfile()
})

// ── Listen for storage changes ──

chrome.storage.onChanged.addListener((changes) => {
    if (changes.profileId) {
        const newId = changes.profileId.newValue
        if (newId) {
            showActiveProfile(newId, enableToggle.checked)
        } else {
            showNoProfile()
        }
    }
    if (changes.enabled) {
        const isEnabled = changes.enabled.newValue !== false
        enableToggle.checked = isEnabled
        const id = profileValue.textContent.replace('@', '')
        if (id && id != '—') {
            showActiveProfile(id, isEnabled)
        }
    }
})

loadState()
