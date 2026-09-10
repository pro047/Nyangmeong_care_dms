import { describe, expect, it } from 'vitest'
import { attachVersionWarning, uploadTarget } from '@/lib/attach-plan'
import type { SimilarCandidate } from '@/lib/similar-document'

const FOLDER = 'folder_screen_main'

function candidate(id: string, latestFileName: string): SimilarCandidate {
  return { id, folderId: FOLDER, createdById: 'user_1', latestFileName }
}

describe('uploadTarget', () => {
  const candidates = [candidate('doc_1', '03_메인페이지_화면설계서_v0.6.html')]

  it('고른 후보가 목록에 있으면 붙이기다', () => {
    expect(uploadTarget('doc_1', FOLDER, candidates)).toEqual({
      kind: 'attach',
      documentId: 'doc_1',
    })
  })

  it('아무것도 안 골랐으면 그 폴더의 새 문서다', () => {
    expect(uploadTarget(undefined, FOLDER, candidates)).toEqual({
      kind: 'new',
      folderId: FOLDER,
    })
  })

  it('미분류는 folderId 가 null 인 새 문서다', () => {
    expect(uploadTarget(undefined, null, [])).toEqual({ kind: 'new', folderId: null })
  })

  // 목적지를 바꾸면 후보 목록이 갈아치워진다. 선택만 남으면 다른 폴더의 문서에 붙는데
  // 붙인 판을 떼는 화면이 없어 되돌릴 수 없다.
  it('목적지가 바뀌어 후보에서 사라진 선택은 버리고 새 문서로 떨어진다', () => {
    expect(uploadTarget('doc_1', 'folder_other', [])).toEqual({
      kind: 'new',
      folderId: 'folder_other',
    })
  })

  it('후보가 남아 있어도 다른 문서의 id 면 붙이지 않는다', () => {
    expect(uploadTarget('doc_gone', FOLDER, candidates)).toEqual({
      kind: 'new',
      folderId: FOLDER,
    })
  })
})

describe('attachVersionWarning', () => {
  it('올리는 쪽이 더 높은 판이면 경고하지 않는다', () => {
    expect(attachVersionWarning('설계서_v0.6.html', '설계서_v0.3.html')).toBeNull()
  })

  it('낮은 판을 붙이려 하면 danger 다', () => {
    const warning = attachVersionWarning('설계서_v0.3.html', '설계서_v0.6.html')
    expect(warning?.level).toBe('danger')
    // 두 판을 다 보여야 사람이 판단한다.
    expect(warning?.message).toContain('v0.6')
    expect(warning?.message).toContain('v0.3')
  })

  it('같은 판번호면 notice 다', () => {
    const warning = attachVersionWarning('설계서_v0.6.html', '설계서_v0_6.html')
    expect(warning?.level).toBe('notice')
    expect(warning?.message).toContain('v0.6')
  })

  // 실데이터에 판번호 없는 파일이 있다. 이걸 danger 로 띄우면 경고가 일상이 되어 무시된다.
  it('한쪽이라도 판번호가 없으면 notice 다', () => {
    expect(attachVersionWarning('와이어프레임.html', '설계서_v0.6.html')?.level).toBe('notice')
    expect(attachVersionWarning('설계서_v0.6.html', '와이어프레임.html')?.level).toBe('notice')
  })

  it('모든 경고가 최신본이 뒤집힌다는 결과를 말한다', () => {
    const messages = [
      attachVersionWarning('설계서_v0.3.html', '설계서_v0.6.html'),
      attachVersionWarning('설계서_v0.6.html', '설계서_v0_6.html'),
      attachVersionWarning('와이어프레임.html', '설계서_v0.6.html'),
    ]
    for (const warning of messages) {
      expect(warning?.message).toContain('최신본이 됩니다')
    }
  })
})
