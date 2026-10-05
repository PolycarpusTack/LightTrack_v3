// LightTrack Browser Extension - Background Script
// Tracks web browsing activity and sends to LightTrack desktop app

// Default port - can be configured via extension settings
const DEFAULT_PORT = 41417;
let lighttrackPort = DEFAULT_PORT;
// The desktop app listens on the IPv4 loopback address only.
let lighttrackUrl = `http://127.0.0.1:${lighttrackPort}`;

// Load saved port from storage
chrome.storage.sync.get(['lighttrackPort'], (result) => {
    if (result.lighttrackPort) {
        lighttrackPort = result.lighttrackPort;
        lighttrackUrl = `http://127.0.0.1:${lighttrackPort}`;
    }
});

// Listen for port changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.lighttrackPort) {
        lighttrackPort = changes.lighttrackPort.newValue || DEFAULT_PORT;
        lighttrackUrl = `http://127.0.0.1:${lighttrackPort}`;
        isConnected = false; // Force reconnection check
        checkConnection();
    }
});

// State
let isConnected = false;
let isPaired = false;
let currentTab = null;
let lastActivityTime = Date.now();
// Token issued by LightTrack after pairing (LT3-004). Kept in local (not synced) storage.
let sessionToken = null;
const tokenReady = new Promise(resolve => {
    chrome.storage.local.get(['lighttrackToken'], (result) => {
        sessionToken = result.lighttrackToken || null;
        resolve();
    });
});

function authHeaders() {
    return sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {};
}

function forgetToken() {
    sessionToken = null;
    isPaired = false;
    chrome.storage.local.remove('lighttrackToken');
}

// Check that LightTrack is running and whether this extension is paired
async function checkConnection() {
    await tokenReady;
    try {
        const response = await fetch(`${lighttrackUrl}/status`, { method: 'GET', mode: 'cors', headers: authHeaders() });
        isConnected = response.ok;
        if (response.ok) {
            const data = await response.json();
            isPaired = Boolean(data.paired);
            if (sessionToken && !isPaired) forgetToken(); // revoked in LightTrack
        }
        return isConnected;
    } catch (error) {
        isConnected = false;
        return false;
    }
}

async function postJson(path, body) {
    const response = await fetch(`${lighttrackUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
        mode: 'cors'
    });
    let data = {};
    try { data = await response.json(); } catch (e) { /* empty body */ }
    return { status: response.status, ok: response.ok, data };
}

// Pairing: LightTrack shows a code on the desktop; the user types it in the popup.
async function startPairing() {
    const { ok, data } = await postJson('/pair/start', {});
    if (!ok) throw new Error(data.error || 'Could not start pairing');
    return data.pairingId;
}

async function completePairing(pairingId, code) {
    const { ok, data } = await postJson('/pair/complete', { pairingId, code });
    if (!ok) throw new Error(data.error || 'Pairing failed');
    sessionToken = data.token;
    isPaired = true;
    await chrome.storage.local.set({ lighttrackToken: data.token });
}

// Send activity to LightTrack (only once paired)
async function sendActivity(tabInfo) {
    if (!isConnected || !isPaired) {
        await checkConnection();
        if (!isConnected || !isPaired) return;
    }

    try {
        const { status } = await postJson('/browser-activity', {
            url: tabInfo.url,
            title: tabInfo.title,
            timestamp: new Date().toISOString(),
            browser: getBrowserName()
        });
        if (status === 401) forgetToken();
        lastActivityTime = Date.now();
    } catch (error) {
        isConnected = false;
    }
}

// Get browser name
function getBrowserName() {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
}

// Tab event listeners
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !tab.url.startsWith('chrome://')) {
        currentTab = {
            id: tab.id,
            url: tab.url,
            title: tab.title || 'Loading...'
        };
        sendActivity(currentTab);
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
        if (tab.url && !tab.url.startsWith('chrome://')) {
            currentTab = {
                id: tab.id,
                url: tab.url,
                title: tab.title || 'Loading...'
            };
            sendActivity(currentTab);
        }
    }
});

// Window focus change
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus
        currentTab = null;
    } else {
        // Browser gained focus
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].url && !tabs[0].url.startsWith('chrome://')) {
            currentTab = {
                id: tabs[0].id,
                url: tabs[0].url,
                title: tabs[0].title || 'Loading...'
            };
            sendActivity(currentTab);
        }
    }
});

// Periodic heartbeat to maintain tracking
setInterval(async () => {
    if (currentTab && Date.now() - lastActivityTime > 30000) {
        // Send heartbeat every 30 seconds
        sendActivity(currentTab);
    }
}, 30000);

// Initial connection check
checkConnection();

// Send page context to LightTrack (only once paired)
async function sendPageContext(contextData) {
    if (!isConnected || !isPaired) {
        await checkConnection();
        if (!isConnected || !isPaired) return;
    }
    try {
        const { status } = await postJson('/page-context', contextData);
        if (status === 401) forgetToken();
    } catch (error) {
        isConnected = false;
    }
}

// Message handling from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getStatus') {
        sendResponse({
            connected: isConnected,
            paired: isPaired,
            currentTab: currentTab
        });
    } else if (request.action === 'startPairing') {
        startPairing()
            .then(pairingId => sendResponse({ pairingId }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    } else if (request.action === 'completePairing') {
        completePairing(request.pairingId, request.code)
            .then(() => sendResponse({ paired: true }))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    } else if (request.action === 'checkConnection') {
        checkConnection().then(connected => {
            sendResponse({ connected });
        });
        return true; // Will respond asynchronously
    } else if (request.action === 'pageContext') {
        // Handle page context from content script
        const contextData = request.data;
        if (contextData) {
            // Determine context type and forward to LightTrack
            let context = { url: contextData.url };

            if (contextData.tickets && contextData.tickets.length > 0) {
                // JIRA tickets detected
                const firstTicket = contextData.tickets[0];
                const projectKey = firstTicket.split('-')[0];
                context.type = 'jira';
                context.data = {
                    issueKey: firstTicket,
                    projectKey: projectKey,
                    allTickets: contextData.tickets
                };
            } else if (contextData.githubIssue) {
                // GitHub issue detected
                const pathParts = new URL(contextData.url).pathname.split('/');
                context.type = 'github';
                context.data = {
                    owner: pathParts[1] || '',
                    repo: pathParts[2] || '',
                    type: 'issue',
                    number: parseInt(contextData.githubIssue.replace('#', ''), 10)
                };
            }

            if (context.type) {
                sendPageContext(context);
            }
        }
        sendResponse({ received: true });
    } else if (request.action === 'getPort') {
        sendResponse({ port: lighttrackPort });
    }
});
