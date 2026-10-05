# Security policy

## Supported scope

Only the latest commit on the default branch is supported. LightTrack v3 is the canonical codebase ([ADR 0002](docs/adr/0002-adopt-lighttrack-v3-as-canonical.md)) and supports Windows 11 x64 only; see `docs/SUPPORTED_PLATFORMS.md`.

## Reporting a vulnerability

Do not open a public issue containing secrets, personal activity titles or exploit details. Use GitHub private vulnerability reporting for the repository owner. Include the affected version, reproduction steps, impact and any suggested mitigation. Remove or redact customer, Jira, Salesforce and RDP identifiers.

## Product security boundaries

- LightTrack must not capture screenshots, keystrokes, OCR output or remote RDP contents.
- Renderer processes use context isolation, no Node integration and sandboxing through the active window manager.
- Browser-extension traffic must remain loopback-only, authenticated and schema-validated.
- OAuth tokens and future database keys must use operating-system protected storage. `electron-store` encryption is not an authentication or key-management boundary.
- Raw activity titles and remote-session metadata must not enter SAP exports unless an explicit export profile requires them.

Dependency advisories are enforced at moderate severity in CI. Any temporary exception must be recorded in `docs/security/dependency-exceptions.md` with affected package, exposure analysis, owner and expiry date; CI must not be silently disabled.
