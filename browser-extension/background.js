// LightTrack Browser Extension - Background Script
// Tracks web browsing activity and sends to LightTrack desktop app

// Default port - can be configured via extension settings
const DEFAULT_PORT = 41417;
let lighttrackPort = DEFAULT_PORT;
let lighttrackUrl = `http://localhost:${lighttrackPort}`;

// Load saved port from storage
chrome.storage.sync.get(['lighttrackPort'], (result) => {
    if (result.lighttrackPort) {
        lighttrackPort = result.lighttrackPort;
        lighttrackUrl = `http://localhost:${lighttrackPort}`;
    }
});

// Listen for port changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.lighttrackPort) {
        lighttrackPort = changes.lighttrackPort.newValue || DEFAULT_PORT;
        lighttrackUrl = `http://localhost:${lighttrackPort}`;
        isConnected = false; // Force reconnection check
        checkConnection();
    }
});

// State
let isConnected = false;
let currentTab = null;
let lastActivityTime = Date.now();
let sessionToken = null; // Auth token from LightTrack server

// Check connection to LightTrack and get session token
async function checkConnection() {
    try {
        const response = await fetch(`${lighttrackUrl}/status`, {
            method: 'GET',
            mode: 'cors'
        });
        isConnected = response.ok;

        // Get session token from response
        if (response.ok) {
            const data = await response.json();
            if (data.token) {
                sessionToken = data.token;
            }
        }

        return isConnected;
    } catch (error) {
        isConnected = false;
        sessionToken = null;
        return false;
    }
}

// Send activity to LightTrack
async function sendActivity(tabInfo) {
    if (!isConnected || !sessionToken) {
        const connected = await checkConnection();
        if (!connected || !sessionToken) return;
    }

    try {
        const activity = {
            url: tabInfo.url,
            title: tabInfo.title,
            timestamp: new Date().toISOString(),
            browser: getBrowserName()
        };

        const response = await fetch(`${lighttrackUrl}/browser-activity`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify(activity),
            mode: 'cors'
        });

        // If unauthorized, try to refresh token
        if (response.status === 401) {
            sessionToken = null;
            await checkConnection();
            return;
        }

        lastActivityTime = Date.now();
    } catch (error) {
        console.error('Failed to send activity:', error);
        isConnected = false;
        sessionToken = null;
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

// Send page context to LightTrack
async function sendPageContext(contextData) {
    if (!isConnected || !sessionToken) {
        const connected = await checkConnection();
        if (!connected || !sessionToken) return;
    }

    try {
        const response = await fetch(`${lighttrackUrl}/page-context`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify(contextData),
            mode: 'cors'
        });

        // If unauthorized, try to refresh token
        if (response.status === 401) {
            sessionToken = null;
            await checkConnection();
        }
    } catch (error) {
        console.error('Failed to send page context:', error);
        sessionToken = null;
    }
}

// Message handling from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getStatus') {
        sendResponse({
            connected: isConnected,
            currentTab: currentTab
        });
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
