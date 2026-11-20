@echo off
chcp 65001 >nul
title AI 비서 PC 일꾼
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 필요해요. 열리는 사이트에서 LTS 버전을 설치한 뒤 이 파일을 다시 더블클릭해 주세요.
  start https://nodejs.org/ko
  pause
  exit /b
)
rem 학교망처럼 인증서를 바꿔 끼우는 곳에서도 되게 윈도우 인증서를 써요
node --use-system-ca -e "" >nul 2>nul && set NODE_OPTIONS=--use-system-ca
if not exist node_modules (
  echo 처음 한 번 준비하는 중이에요... 1~2분 걸려요
  call npm install --omit=dev --no-audit --no-fund
)
node worker.js
pause
