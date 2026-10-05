# Security policy

## Supported scope

Only the latest commit on the default branch is supported. LightTrack v3 is the canonical codebase ([ADR 0002](docs/adr/0002-adopt-lighttrack-v3-as-canonical.md)) and supports Windows 11 x64 only; see `docs/SUPPORTED_PLATFORMS.md`.

## Reporting a vulnerability

Do not open a public issue containing secrets, personal activity titles or exploit details. Use GitHub private vulnerability reporting for the repository owner. Include the affected version, reproduction steps, impact and any suggested mitigation. Remove or redact customer, Jira, Salesforce and RDP identifiers.

## Product security boundaries

- LightTrack must not capture screenshots, keystrokes, OCR output or remote RDP contents.
- Renderer processes use context isolation, no Node integration and sandboxing through the active window manager.
- Browser-extension traffic is loopback-only (127.0.0.1), accepted only from paired extensions and schema-validated. Pairing needs a 6-digit code shown in the desktop app (two-minute expiry, five attempts, single use); LightTrack stores only a hash of each token, bound to the extension origin. Titles, URLs and tokens are not logged. Paired extensions can be disconnected in Settings > Data.
- OAuth tokens and future database keys must use operating-system protected storage. `electron-store` encryption is not an authentication or key-management boundary.
- Raw activity titles and remote-session metadata must not enter SAP exports unless an explicit export profile requires them.

## Data at rest

- **Calendar ICS URL.** Stored encrypted with Windows data protection (Electron `safeStorage`) under `settings.calendarIcsUrlProtected`. Plain values from older versions are migrated on start. The renderer only receives a masked form (`https://host/…`), and the URL is not logged.
- **Data file key.** When the data file is encrypted, its key is random and stored encrypted with Windows data protection in `.keyref`. There is no guessable fallback. If the key cannot be created or unlocked, LightTrack shows an error and exits without changing data. A file written with the key derived by older versions is migrated once, after a backup (`config.pre-keyref-backup.json`).
- **When the data file is encrypted.** Installed builds always encrypt it (owner decision, 2026-10-05). Development runs (`npm start`, `npm run dev`) keep it unencrypted for debugging. On the first start after updating, an existing unencrypted file is migrated once and the original is kept as `config.pre-keyref-backup.json`; delete that backup once you have confirmed your data.
- **What the encryption is tied to.** The key can only be unlocked by the same Windows user with the same LightTrack profile folder (`%APPDATA%\LightTrack`, including its `Local State` file). Copying the whole folder to the same account works. Moving to another PC or Windows account requires a LightTrack backup (Settings > Data > Create Backup) restored in the new installation.
- **SAP exports.** Built in the main process from stored activities. Raw window titles are never exported, and text cells are escaped against spreadsheet formula injection.

## Updates

In-app updates are disabled (`src/main/update-policy.js`). The app does not check, download or install updates, because releases are not yet code-signed and the update feed is not one this project controls. Install new versions manually from the GitHub releases page. Updates will be re-enabled with signed releases (LT3-603).

Dependency advisories are enforced at moderate severity in CI. Any temporary exception must be recorded in `docs/security/dependency-exceptions.md` with affected package, exposure analysis, owner and expiry date; CI must not be silently disabled.
