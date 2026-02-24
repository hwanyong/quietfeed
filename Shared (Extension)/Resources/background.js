/*
 * QuietFeed — Background Service Worker
 *
 * Manages profile ID storage and messaging between content script and popup.
 */

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type == 'getProfileId') {
        return browser.storage.local.get('profileId').then(result => ({
            profileId: result.profileId || null
        }))
    }

    if (request.type == 'setProfileId') {
        return browser.storage.local.set({ profileId: request.profileId }).then(() => ({
            success: true
        }))
    }

    if (request.type == 'clearProfileId') {
        return browser.storage.local.remove('profileId').then(() => ({
            success: true
        }))
    }
})
