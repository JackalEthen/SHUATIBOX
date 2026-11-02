!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    RMDir /r "$APPDATA\${BUNDLEID}\banks"
    Delete "$APPDATA\${BUNDLEID}\user.db"
    Delete "$APPDATA\${BUNDLEID}\user.db-wal"
    Delete "$APPDATA\${BUNDLEID}\user.db-shm"
    RMDir "$APPDATA\${BUNDLEID}"
  ${EndIf}
!macroend
