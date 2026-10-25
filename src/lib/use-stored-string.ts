'use client'

import { useSyncExternalStore } from 'react'

// localStorage 를 useState 초기화에서 읽으면 서버가 그린 기본값과 어긋나 하이드레이션
// 불일치가 난다. useSyncExternalStore 는 서버 스냅샷을 따로 받아 이 경우를 정상 처리한다.
// storage 이벤트는 다른 탭에서 바꾼 값만 알려 준다. 같은 탭의 쓰기는 writeStoredString 이
// 직접 알린다 — 그래야 쓴 직후 화면이 저장값을 따른다.
const listeners = new Set<() => void>()

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** 저장된 문자열. 서버 렌더와 첫 하이드레이션에서는 null 이다. */
export function useStoredString(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key)
      } catch {
        // 사파리 프라이빗 모드 등에서 접근 자체가 던진다. 기본값으로 떨어지면 된다.
        return null
      }
    },
    () => null,
  )
}

/** 저장에 성공했는지 돌려준다. 실패하면 부르는 쪽이 이번 세션의 값을 따로 쥐고 있어야 한다. */
export function writeStoredString(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 사파리 프라이빗 모드 등. 사용자에게 알릴 만한 실패가 아니다.
    return false
  }
  for (const l of listeners) l()
  return true
}
