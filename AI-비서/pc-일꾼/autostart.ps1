# AI 비서 PC 일꾼 - PC를 켤 때 창 없이(작업 표시줄에 안 뜨게) 켜기
#   -Install   : 시작프로그램에 바로가기를 만들고 지금 바로 숨어서 켜요
#   -Uninstall : 바로가기를 지우고 숨어서 돌던 일꾼을 꺼요
#   (아무것도 없이) : 숨어서 일꾼을 돌려요. 꺼지면 1분 뒤 다시 켜요(인터넷이 늦게 붙을 때 대비)
param([switch]$Install, [switch]$Uninstall)
$ErrorActionPreference = 'Stop'
$Dir   = $PSScriptRoot
$Home2 = Join-Path $env:LOCALAPPDATA 'AI비서일꾼'
$Lnk   = Join-Path ([Environment]::GetFolderPath('Startup')) 'AI 비서 PC 일꾼.lnk'
$Lock  = Join-Path $Home2 '켜짐.json'
# 윈도우 11은 powershell을 '터미널' 창으로 열어 -WindowStyle Hidden이 안 먹어요(작업 표시줄에 검은 창, 닫으면 꺼짐)
# → conhost --headless 로 창 없이 켜요 (v0.9.1)
$Ps    = Join-Path $env:SystemRoot 'System32\conhost.exe'
$Args0 = "--headless `"$(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""

function Stop-Worker {
    if (-not (Test-Path $Lock)) { return $false }
    try {
        $l = [IO.File]::ReadAllText($Lock, [Text.Encoding]::UTF8) | ConvertFrom-Json
        $p = Get-Process -Id $l.pid -ErrorAction SilentlyContinue
        if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $l.pid -Force; return $true }
    } catch {}
    return $false
}

if ($Uninstall) {
    if (Test-Path $Lnk) { Remove-Item $Lnk -Force }   # 바로가기가 없으면 숨은 일꾼도 다시 켜지지 않아요
    $was = Stop-Worker
    Write-Host ''
    Write-Host '  자동 켜기를 껐어요. PC를 켜도 일꾼이 저절로 켜지지 않아요.'
    if ($was) { Write-Host '  숨어서 돌던 일꾼도 껐어요.' }
    Write-Host '  다시 쓰려면 일꾼-켜기.bat(창 보임) 또는 PC-켤때-자동켜기.bat을 더블클릭하세요.'
    exit 0
}

if ($Install) {
    if (-not (Test-Path (Join-Path $Dir 'node_modules'))) {
        Write-Host ''
        Write-Host '  먼저 일꾼-켜기.bat을 한 번 더블클릭해서 준비와 연결(8글자 코드)을 끝내 주세요.'
        exit 1
    }
    if (-not (Test-Path (Join-Path $Home2 'login.json'))) {
        Write-Host ''
        Write-Host '  아직 앱과 연결하지 않았어요. 일꾼-켜기.bat을 더블클릭해서 연결 코드를 먼저 넣어 주세요.'
        exit 1
    }
    $sh = New-Object -ComObject WScript.Shell
    $sc = $sh.CreateShortcut($Lnk)
    $sc.TargetPath = $Ps
    $sc.Arguments = $Args0
    $sc.WorkingDirectory = $Dir
    $sc.WindowStyle = 7
    $sc.Description = 'AI 비서 PC 일꾼 (숨어서 켜기)'
    $sc.Save()
    Start-Process $Ps -ArgumentList $Args0 -WindowStyle Hidden
    Write-Host ''
    Write-Host '  됐어요! 이제 PC를 켜면 일꾼이 창 없이 저절로 켜져요(작업 표시줄에 안 보여요).'
    Write-Host '  지금도 숨어서 켜졌어요. 켜져 있는지는 폰 앱 설정의 PC 일꾼에서 볼 수 있어요.'
    Write-Host '  맡긴 일(지켜보기·대신 하기)이 있을 때만 브라우저 창이 열려요.'
    Write-Host '  이 폴더를 옮기거나 지우면 자동 켜기가 안 돼요. 옮겼다면 이 파일을 다시 더블클릭하세요.'
    exit 0
}

# ---- 숨어서 돌리기 ----
Set-Location $Dir
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { exit 1 }
$env:NODE_OPTIONS = ''
& $node --use-system-ca -e '""' 2>$null
if ($LASTEXITCODE -eq 0) { $env:NODE_OPTIONS = '--use-system-ca' }   # 학교망 인증서
for ($i = 0; $i -lt 30; $i++) {
    & $node worker.js --hidden
    $code = $LASTEXITCODE
    # 0 = 끝, 3 = 연결 필요(사람이 해야 함), 4 = 이미 켜져 있음 → 다시 켜지 않아요
    if ($code -eq 0 -or $code -eq 3 -or $code -eq 4) { break }
    if (-not (Test-Path $Lnk)) { break }   # 자동켜기-끄기로 꺼졌으면 그만
    Start-Sleep -Seconds 60
}
