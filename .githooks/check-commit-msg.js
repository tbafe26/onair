#!/usr/bin/env node
// 커밋 메시지가 AGENTS.md의 커밋 규칙(Conventional Commits, 한국어 제목)을 따르는지 검사한다.
// 사용: node check-commit-msg.js <메시지 파일>
const fs = require('fs')

const TYPES = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore']
const MAX_SUBJECT_LENGTH = 72

function check(raw) {
  const problems = []
  if (raw.charCodeAt(0) === 0xfeff) problems.push('메시지 파일 앞에 BOM이 있습니다. BOM 없는 UTF-8로 저장하세요.')

  const lines = raw.replace(/^﻿/, '').split(/\r?\n/).filter((line) => !line.startsWith('#'))
  const subject = lines[0] ?? ''
  // GitHub에서 PR을 병합할 때 만드는 커밋만 예외다.
  if (/^Merge pull request #\d+ /.test(subject)) return problems

  const match = /^([a-z]+)(\([^)]+\))?!?: (.+)$/.exec(subject)
  if (!match) {
    problems.push(`제목은 "<type>: <한국어 제목>" 형식이어야 합니다. type: ${TYPES.join(', ')}`)
  } else {
    if (!TYPES.includes(match[1])) problems.push(`type "${match[1]}"은(는) 쓸 수 없습니다. ${TYPES.join(', ')} 중 하나를 씁니다.`)
    if (!/[가-힣]/.test(match[3])) problems.push('제목은 한국어로 씁니다.')
  }
  if ([...subject].length > MAX_SUBJECT_LENGTH) problems.push(`제목이 ${MAX_SUBJECT_LENGTH}자를 넘습니다. 50자 안팎으로 줄이세요.`)
  if (/[.。]\s*$/.test(subject)) problems.push('제목 끝에 마침표를 찍지 않습니다.')
  if (lines.length > 1 && lines[1].trim() !== '') problems.push('제목과 본문 사이는 한 줄 띄웁니다.')
  return problems
}

if (require.main === module) {
  const file = process.argv[2]
  if (!file) {
    console.error('사용: node check-commit-msg.js <메시지 파일>')
    process.exit(2)
  }
  const problems = check(fs.readFileSync(file, 'utf8'))
  if (problems.length > 0) {
    console.error('[commit-msg] 커밋 메시지 규칙을 지키지 않아 커밋을 막았습니다.')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
}

module.exports = { check }
