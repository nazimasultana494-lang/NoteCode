Param(
  [string]$Target = "$env:LocalAppData\Programs\NoteCode"
)

$ErrorActionPreference = 'Stop'

Write-Host "Uninstalling NoteCode..." -ForegroundColor Cyan

# Remove Start Menu shortcut
$startMenuDir = Join-Path $env:AppData 'Microsoft\Windows\Start Menu\Programs'
$startShortcut = Join-Path $startMenuDir 'NoteCode.lnk'
if (Test-Path $startShortcut) { Remove-Item -Force $startShortcut }

# Remove Desktop shortcut
$desktop = [Environment]::GetFolderPath('Desktop')
$desktopShortcut = Join-Path $desktop 'NoteCode.lnk'
if (Test-Path $desktopShortcut) { Remove-Item -Force $desktopShortcut }

# Remove uninstall registry key
$uninstallKey = 'HKCU:Software\Microsoft\Windows\CurrentVersion\Uninstall\NoteCode'
if (Test-Path $uninstallKey) { Remove-Item -Recurse -Force $uninstallKey }

# Stop running app if any
$proc = Get-Process -Name 'NoteCode' -ErrorAction SilentlyContinue
if ($proc) { $proc | Stop-Process -Force }

# Remove install folder
if (Test-Path $Target) {
  Remove-Item -Recurse -Force $Target
}

Write-Host "NoteCode removed." -ForegroundColor Green
