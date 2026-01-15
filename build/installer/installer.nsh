; LightTrack Custom NSIS Installer Script
; Handles previous installation detection, upgrade, and removal

; Suppress warning about unused variables (UpgradeMode not used in uninstaller build)
!pragma warning disable 6001

!macro customHeader
  ; Custom variables
  Var PreviousInstallDir
  Var PreviousVersion
  Var UpgradeMode
!macroend

!macro preInit
  ; Check for previous installation in registry
  ReadRegStr $PreviousInstallDir HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"

  ; Also check HKLM for machine-wide installs
  ${If} $PreviousInstallDir == ""
    ReadRegStr $PreviousInstallDir HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "InstallLocation"
  ${EndIf}

  ; Get previous version if installed
  ${If} $PreviousInstallDir != ""
    ReadRegStr $PreviousVersion HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
    ${If} $PreviousVersion == ""
      ReadRegStr $PreviousVersion HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  ; Initialize upgrade mode (0 = fresh install, 1 = upgrade)
  StrCpy $UpgradeMode "0"

  ; If previous installation found, ask user what to do
  ${If} $PreviousInstallDir != ""
    StrCpy $UpgradeMode "1"

    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION \
      "LightTrack version $PreviousVersion is already installed at:$\r$\n$\r$\n$PreviousInstallDir$\r$\n$\r$\nWould you like to upgrade to version ${VERSION}?$\r$\n$\r$\nYes = Upgrade (keep settings)$\r$\nNo = Fresh install (remove old version)$\r$\nCancel = Abort installation" \
      IDYES upgrade IDNO fresh

    ; User clicked Cancel
    Abort

    upgrade:
      ; Upgrade mode - keep user data, just update files
      StrCpy $INSTDIR $PreviousInstallDir
      Goto done

    fresh:
      ; Fresh install - uninstall old version first
      MessageBox MB_YESNO|MB_ICONEXCLAMATION \
        "This will remove the previous installation and ALL user data.$\r$\n$\r$\nDo you want to continue?" \
        IDYES confirmFresh IDNO abort

      abort:
        Abort

      confirmFresh:
        ; Run the uninstaller silently
        ${If} ${FileExists} "$PreviousInstallDir\Uninstall ${PRODUCT_FILENAME}.exe"
          ExecWait '"$PreviousInstallDir\Uninstall ${PRODUCT_FILENAME}.exe" /S _?=$PreviousInstallDir'
          ; Wait for uninstaller to complete
          Sleep 2000
          ; Remove leftover directory
          RMDir /r "$PreviousInstallDir"
        ${EndIf}
        StrCpy $UpgradeMode "0"
        Goto done

    done:
  ${EndIf}
!macroend

!macro customInstall
  ; Backup user data before upgrade if needed
  ${If} $UpgradeMode == "1"
    ; Create backup of user settings
    ${If} ${FileExists} "$LOCALAPPDATA\LightTrack\config.json"
      CreateDirectory "$LOCALAPPDATA\LightTrack\backup"
      CopyFiles /SILENT "$LOCALAPPDATA\LightTrack\config.json" "$LOCALAPPDATA\LightTrack\backup\config.json.bak"
    ${EndIf}
    ${If} ${FileExists} "$LOCALAPPDATA\LightTrack\activities.json"
      CopyFiles /SILENT "$LOCALAPPDATA\LightTrack\activities.json" "$LOCALAPPDATA\LightTrack\backup\activities.json.bak"
    ${EndIf}
  ${EndIf}

  ; Write upgrade marker file for app to detect on first run
  FileOpen $0 "$INSTDIR\upgrade-marker.json" w
  FileWrite $0 '{"previousVersion": "$PreviousVersion", "upgradeMode": "$UpgradeMode", "installDate": "${__DATE__} ${__TIME__}"}'
  FileClose $0
!macroend

!macro customUnInstall
  ; Ask user if they want to keep their data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to keep your LightTrack data (settings, activity history)?$\r$\n$\r$\nYes = Keep data (can be used if you reinstall)$\r$\nNo = Remove everything" \
    IDYES keepData IDNO removeData

  removeData:
    ; Remove user data directory
    RMDir /r "$LOCALAPPDATA\LightTrack"
    Goto uninstallDone

  keepData:
    ; Keep user data, just log that we're keeping it
    ; Nothing to do here

  uninstallDone:
!macroend
