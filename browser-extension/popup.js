// Popup script for LightTrack Browser Extension

let pendingPairingId = null;

document.addEventListener('DOMContentLoaded', async () => {
    updateStatus();
    loadPortSetting();

    // Pairing (LT3-004): LightTrack shows a code on the desktop; type it here.
    document.getElementById('pair-start').addEventListener('click', () => {
        setPairMessage('Asking LightTrack for a code...');
        chrome.runtime.sendMessage({ action: 'startPairing' }, (response) => {
            if (!response || response.error) {
                setPairMessage(response?.error || 'LightTrack is not reachable.');
                return;
            }
            pendingPairingId = response.pairingId;
            document.getElementById('pair-code-row').hidden = false;
            document.getElementById('pair-code').focus();
            setPairMessage('Type the code that LightTrack shows on your desktop.');
        });
    });

    document.getElementById('pair-confirm').addEventListener('click', confirmPairing);
    document.getElementById('pair-code').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmPairing();
    });

    // Check connection button
    document.getElementById('check-connection').addEventListener('click', async () => {
        document.getElementById('status-text').textContent = 'Checking...';

        chrome.runtime.sendMessage({ action: 'checkConnection' }, () => {
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

function setPairMessage(text) {
    document.getElementById('pair-message').textContent = text;
}

function confirmPairing() {
    const code = document.getElementById('pair-code').value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code) || !pendingPairingId) {
        setPairMessage('Enter the 6-digit code.');
        return;
    }
    chrome.runtime.sendMessage({ action: 'completePairing', pairingId: pendingPairingId, code }, (response) => {
        if (!response || response.error) {
            setPairMessage(response?.error || 'Pairing failed.');
            return;
        }
        pendingPairingId = null;
        document.getElementById('pair-code').value = '';
        document.getElementById('pair-code-row').hidden = true;
        setPairMessage('');
        updateStatus();
    });
}

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

        document.getElementById('pairing').hidden = !(response.connected && !response.paired);

        if (response.connected && response.paired) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected to LightTrack';

            if (response.currentTab) {
                currentTabDiv.style.display = 'block';
                document.getElementById('tab-title').textContent = response.currentTab.title;
                document.getElementById('tab-url').textContent = response.currentTab.url;
            }
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = response.connected ? 'LightTrack found - not paired' : 'Not connected';
            currentTabDiv.style.display = 'none';
        }
    });
}
