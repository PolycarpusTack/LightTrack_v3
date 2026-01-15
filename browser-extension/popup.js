// Popup script for LightTrack Browser Extension

document.addEventListener('DOMContentLoaded', async () => {
    updateStatus();
    loadPortSetting();

    // Check connection button
    document.getElementById('check-connection').addEventListener('click', async () => {
        document.getElementById('status-text').textContent = 'Checking...';

        chrome.runtime.sendMessage({ action: 'checkConnection' }, (response) => {
            updateStatus();
        });
    });

    // Open LightTrack button
    document.getElementById('open-lighttrack').addEventListener('click', () => {
        // Try to open LightTrack via custom protocol (if implemented)
        window.open('lighttrack://open', '_blank');

        // Close popup
        window.close();
    });

    // Save port button
    document.getElementById('save-port').addEventListener('click', () => {
        const portInput = document.getElementById('port-input');
        const port = parseInt(portInput.value, 10);

        if (port >= 1024 && port <= 65535) {
            chrome.storage.sync.set({ lighttrackPort: port }, () => {
                document.getElementById('status-text').textContent = 'Port saved. Reconnecting...';
                setTimeout(() => {
                    chrome.runtime.sendMessage({ action: 'checkConnection' }, () => {
                        updateStatus();
                    });
                }, 500);
            });
        } else {
            document.getElementById('status-text').textContent = 'Invalid port (1024-65535)';
        }
    });
});

function loadPortSetting() {
    chrome.storage.sync.get(['lighttrackPort'], (result) => {
        const port = result.lighttrackPort || 41417;
        document.getElementById('port-input').value = port;
    });
}

async function updateStatus() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        const currentTabDiv = document.getElementById('current-tab');
        
        if (response.connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected to LightTrack';
            
            if (response.currentTab) {
                currentTabDiv.style.display = 'block';
                document.getElementById('tab-title').textContent = response.currentTab.title;
                document.getElementById('tab-url').textContent = response.currentTab.url;
            }
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Not connected';
            currentTabDiv.style.display = 'none';
        }
    });
}
