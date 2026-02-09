Param(
  [string]$Source = "$PSScriptRoot\..\dist-electron\win-unpacked",
  [string]$Target = "$env:LocalAppData\Programs\NoteCode",
  [switch]$DesktopShortcut
)

$ErrorActionPreference = 'Stop'

Write-Host "Installing NoteCode..." -ForegroundColor Cyan

# Ensure source exists
if (-not (Test-Path $Source)) {
  throw "Source not found: $Source. Build first (npm run package:win) or copy the win-unpacked folder."
}

# Create target directory
New-Item -ItemType Directory -Force -Path $Target | Out-Null

# Copy files
Write-Host "Copying files to $Target"
Copy-Item -Path (Join-Path $Source '*') -Destination $Target -Recurse -Force

# Create Start Menu shortcut
$startMenuDir = Join-Path $env:AppData 'Microsoft\Windows\Start Menu\Programs'
$startShortcut = Join-Path $startMenuDir 'NoteCode.lnk'
$exePath = Join-Path $Target 'NoteCode.exe'
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($startShortcut)
$sc.TargetPath = $exePath
$sc.WorkingDirectory = $Target
$sc.IconLocation = "$exePath,0"
$sc.Description = 'NoteCode - modern code editor'
$sc.Save()
Write-Host "Created Start Menu shortcut: $startShortcut"

# Optional Desktop shortcut
if ($DesktopShortcut) {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $desktopLnk = Join-Path $desktop 'NoteCode.lnk'
  $sc2 = $ws.CreateShortcut($desktopLnk)
  $sc2.TargetPath = $exePath
  $sc2.WorkingDirectory = $Target
  $sc2.IconLocation = "$exePath,0"
  $sc2.Description = 'NoteCode - modern code editor'
  $sc2.Save()
  Write-Host "Created Desktop shortcut: $desktopLnk"
}

# Add Add/Remove Programs entry (User)
$uninstallKey = 'HKCU:Software\Microsoft\Windows\CurrentVersion\Uninstall\NoteCode'
New-Item -Path $uninstallKey -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name 'DisplayName' -Value 'NoteCode' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name 'DisplayVersion' -Value '0.1.0' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name 'Publisher' -Value 'NoteCode' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name 'InstallLocation' -Value $Target -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name 'DisplayIcon' -Value $exePath -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name 'UninstallString' -Value "powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\\uninstall.ps1`"" -PropertyType String -Force | Out-Null

Write-Host "Installation complete. You can search 'NoteCode' in Start Menu." -ForegroundColor Green
