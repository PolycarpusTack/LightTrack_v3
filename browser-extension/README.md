# LightTrack Browser Extension

Track your web browsing time automatically in LightTrack!

## Features
- Automatic URL and title tracking
- JIRA ticket detection
- GitHub issue detection  
- Lightweight and privacy-focused
- Works with Chrome, Edge, and Chromium browsers

## Installation

### Developer Mode (Current)
1. Open Chrome/Edge
2. Go to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `browser-extension` folder
6. The extension icon should appear in your toolbar
7. Pair it with LightTrack (below)

### Pairing
LightTrack only accepts data from a paired browser.

1. Make sure LightTrack is running.
2. Open the extension popup and choose **Pair**.
3. LightTrack shows a 6-digit code on your desktop. Type it in the popup and choose **Confirm**. The code expires after two minutes.
4. If you did not start pairing yourself, choose **Deny** in LightTrack.

Paired browsers stay paired across restarts. To disconnect them, use **Settings > Data > Browser extension > Disconnect all extensions** in LightTrack, then pair again if needed.

### Chrome Web Store (Future)
Coming soon!

## Requirements
- LightTrack desktop app must be running
- The extension must be paired with LightTrack (see Pairing)

## How It Works
1. The extension monitors your active browser tab
2. Sends URL and title to LightTrack desktop app
3. LightTrack categorizes and tracks the time automatically
4. No data is sent to any external servers

## Privacy
- All data stays local on your computer
- Only sends data to 127.0.0.1 (your own machine), and only after pairing
- No external connections
- No user tracking or analytics

## Configuration
The extension connects to LightTrack on `http://127.0.0.1:41417`. The port can be changed in the popup's Settings section.

## Troubleshooting

### Extension shows "Not connected"
1. Make sure LightTrack desktop app is running
2. If the popup says "LightTrack found - not paired", pair it (see Pairing)
3. Verify firewall isn't blocking loopback (127.0.0.1) connections
4. Try clicking "Check Connection" in the popup

### No time being tracked
1. Verify extension status shows "Connected"
2. Check if current site is being tracked (chrome:// URLs are excluded)
3. Look for the activity in LightTrack's main window

## Development
Made by 2LS - Yannick Verrydt

### Building Icons
Place your LightTrack logo in this folder and create:
- icon-16.png (16x16)
- icon-48.png (48x48)
- icon-128.png (128x128)

### Testing
1. Make changes to the code
2. Go to extension management page
3. Click the refresh button on LightTrack extension
4. Test your changes

## License
Same as LightTrack - MIT
