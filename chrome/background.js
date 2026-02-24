/*
 * QuietFeed — Background Service Worker (Chrome)
 *
 * Manages profile ID storage and messaging between content script and popup.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type == 'getProfileId') {
        chrome.storage.local.get('profileId').then(result => {
            sendResponse({ profileId: result.profileId || null })
        })
        return true
    }

    if (request.type == 'setProfileId') {
        chrome.storage.local.set({ profileId: request.profileId }).then(() => {
            sendResponse({ success: true })
        })
        return true
    }

    if (request.type == 'clearProfileId') {
        chrome.storage.local.remove('profileId').then(() => {
            sendResponse({ success: true })
        })
        return true
    }
})
