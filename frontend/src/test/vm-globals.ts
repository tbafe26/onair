/// <reference types="node" />
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web'

// vmThreads 풀의 jsdom 컨텍스트에는 웹 스트림 전역이 없어 MSW가 불러지지 않는다. Node의 구현을 넣어 준다.
const streams = { ReadableStream, TransformStream, WritableStream }
for (const [name, value] of Object.entries(streams)) {
  if (!(name in globalThis)) {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  }
}
