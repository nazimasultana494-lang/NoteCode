!define APPNAME "NoteCode"
!define COMPANY "NoteCode"
!define VERSION "0.1.0"
!define INSTALLDIR "$LOCALAPPDATA\\Programs\\${APPNAME}"
!define SOURCE_DIR "..\\dist-electron\\win-unpacked"
!define OUTFILE "..\\dist-electron\\NoteCode-Setup.exe"

; MUI (Modern UI)
!include "MUI2.nsh"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "${INSTALLDIR}"
ShowInstDetails show
ShowUninstDetails show

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Languages
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  ; Copy application files
  File /r "${SOURCE_DIR}\\*"

  ; Create Start Menu shortcut
  CreateShortcut "$SMPROGRAMS\\${APPNAME}.lnk" "$INSTDIR\\${APPNAME}.exe" "" "$INSTDIR\\${APPNAME}.exe" 0
  ; Create Desktop shortcut
  CreateShortcut "$DESKTOP\\${APPNAME}.lnk" "$INSTDIR\\${APPNAME}.exe" "" "$INSTDIR\\${APPNAME}.exe" 0

  ; Write uninstall information
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APPNAME}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APPNAME}" "Publisher" "${COMPANY}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APPNAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APPNAME}" "DisplayIcon" "$INSTDIR\\${APPNAME}.exe"

  ; Generate uninstaller
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APPNAME}" "UninstallString" "$INSTDIR\\Uninstall.exe"
SectionEnd

Section "Uninstall"
  ; Remove shortcuts
  Delete "$SMPROGRAMS\\${APPNAME}.lnk"
  Delete "$DESKTOP\\${APPNAME}.lnk"

  ; Remove registry
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APPNAME}"

  ; Close running app
  ; (Best-effort) attempt to kill running process
  nsExec::ExecToStack 'taskkill /F /IM ${APPNAME}.exe'

  ; Remove files
  RMDir /r "$INSTDIR"
SectionEnd
