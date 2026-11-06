#!/usr/bin/env node
// 공개될 글에서 개인 정보를 찾는다. 이 PC의 실제 식별자(호스트 이름, Wi-Fi 이름, LAN 주소, 홈 경로)는
// 실행할 때 읽어 비교만 하므로 저장소에 남지 않는다.
//   node check-public-text.js <파일...>   파일 검사
//   node check-public-text.js --staged    스테이징된 추가 줄 검사(pre-commit)
//   node check-public-text.js --hook      Claude Code PreToolUse 입력(stdin)의 gh 게시 명령 검사
const fs = require('fs')
const os = require('os')
const { execSync } = require('child_process')

const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

function localIdentifiers() {
  const ids = []
  const host = os.hostname()
  if (host && host.length >= 4) ids.push(['이 PC의 호스트 이름', host])
  const ssid = (run('netsh wlan show interfaces').match(/^\s*SSID\s*:\s*(.+)$/m) || [])[1]
  if (ssid && ssid.trim().length >= 3) ids.push(['이 PC의 Wi-Fi 이름', ssid.trim()])
  for (const nic of Object.values(os.networkInterfaces()).flat()) {
    if (nic && nic.family === 'IPv4' && !nic.internal) ids.push(['이 PC의 LAN 주소', nic.address])
  }
  const home = os.homedir()
  ids.push(['이 PC의 홈 경로', home], ['이 PC의 홈 경로', home.replace(/\\/g, '/')])
  return ids
}

const patterns = [
  ['사설 IP 주소', /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g],
  ['사용자 이름이 드러나는 경로', /(?:\b[A-Za-z]:[\\/]+Users[\\/]+|\/c\/Users\/|\/home\/|\/Users\/)(?!(?:me|username|runner|<[^>]+>|\$\{?\w+\}?)(?:[\\/]|\b))[A-Za-z0-9._-]+/gi],
  ['Windows 기본 호스트 이름', /\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{5,}\b/g],
  ['MAC 주소', /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g],
]

function findings(text) {
  const out = []
  for (const [label, re] of patterns) for (const m of text.match(re) || []) out.push([label, m])
  for (const [label, value] of localIdentifiers()) if (text.includes(value)) out.push([label, value])
  return out
}

const mask = (s) => (s.length <= 4 ? '****' : s.slice(0, 3) + '*'.repeat(Math.min(s.length - 3, 8)))

function report(where, found) {
  const seen = new Set()
  console.error(`[민감 정보] ${where}에서 공개되면 안 되는 값을 찾아 막았습니다.`)
  for (const [label, value] of found) {
    const key = label + value
    if (seen.has(key)) continue
    seen.add(key)
    console.error(`  - ${label}: ${mask(value)}`)
  }
  console.error('  자리표시(예: <PC의 LAN 주소>)로 바꾸세요. 오탐으로 보이면 사용자에게 먼저 확인하세요(AGENTS.md 필수 규칙).')
}

function checkHook() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  const command = (input.tool_input && input.tool_input.command) || ''
  const publishes =
    /\bgh\s+(?:issue|pr|release)\s+(?:create|edit|comment|review)\b/.test(command) ||
    /\bgh\s+api\b[\s\S]*(?:\s-f\s|\s-F\s|--field|--raw-field|--input|-X\s*(?:POST|PATCH|PUT))/.test(command) ||
    /\bgh\s+label\s+(?:create|edit)\b/.test(command)
  if (!publishes) return 0
  const fileArgs = /(?:--body-file|--notes-file|--input|-F)\s+("[^"]+"|'[^']+'|\S+)/g
  // 본문 파일의 경로는 게시되지 않으므로 검사 대상에서 뺀다.
  let text = command.replace(fileArgs, (all, f) => (f.includes('=') ? all : ''))
  for (const m of command.matchAll(fileArgs)) {
    const file = m[1].replace(/^["']|["']$/g, '')
    if (file.includes('=') || file === '-') continue
    try {
      text += '\n' + fs.readFileSync(file.replace(/^\/([a-z])\//i, '$1:/'), 'utf8')
    } catch {
      // 파일을 못 읽으면 명령 문자열만 검사한다.
    }
  }
  const found = findings(text)
  if (!found.length) return 0
  report('GitHub에 올릴 글', found)
  return 2
}

function checkStaged() {
  const diff = run('git diff --cached -U0 --no-color')
  const added = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n')
  const names = run('git diff --cached --name-only')
  const found = findings(added + '\n' + names)
  if (!found.length) return 0
  report('스테이징된 변경', found)
  return 1
}

function checkFiles(files) {
  let status = 0
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').replace(/^#.*$/gm, '')
    const found = findings(text)
    if (found.length) {
      report(f, found)
      status = 1
    }
  }
  return status
}

const args = process.argv.slice(2)
if (args[0] === '--hook') process.exit(checkHook())
if (args[0] === '--staged') process.exit(checkStaged())
process.exit(checkFiles(args))
