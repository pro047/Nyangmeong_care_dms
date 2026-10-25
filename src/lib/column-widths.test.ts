import { describe, expect, it } from 'vitest'
import {
  applyBoundaryDelta,
  CELL_HIDE_CLASS,
  clampWidth,
  COL_HIDE_CLASS,
  defaultWidths,
  fitWidths,
  keyboardDelta,
  parseStoredWidths,
  RESIZE_STEP,
  resizeBoundaries,
  serializeWidths,
  storageKey,
  TABLE_COLUMNS,
  TITLE_MIN_WIDTH,
  type Boundary,
  type ColumnSpec,
  type ColumnWidths,
  type ResizableColumn,
  type TableId,
} from '@/lib/column-widths'

const TABLES: readonly TableId[] = ['versions', 'trash', 'documents']

function resizable(specs: readonly ColumnSpec[]): ResizableColumn[] {
  return specs.filter((s): s is ResizableColumn => s.kind === 'resizable')
}

function spec(table: TableId, key: string): ColumnSpec {
  const found = TABLE_COLUMNS[table].find((s) => s.key === key)
  if (!found) throw new Error(`열 없음: ${table}.${key}`)
  return found
}

function resizableSpec(table: TableId, key: string): ResizableColumn {
  const s = spec(table, key)
  if (s.kind !== 'resizable') throw new Error(`resizable 아님: ${table}.${key}`)
  return s
}

function allKeys(specs: readonly ColumnSpec[]): string[] {
  return specs.map((s) => s.key)
}

function fixedSum(specs: readonly ColumnSpec[], visible: readonly string[]): number {
  return specs
    .filter((s) => s.kind === 'fixed' && visible.includes(s.key))
    .reduce((acc, s) => acc + (s.kind === 'fixed' ? s.width : 0), 0)
}

function resizableSum(
  widths: ColumnWidths,
  specs: readonly ColumnSpec[],
  visible: readonly string[],
): number {
  return resizable(specs)
    .filter((s) => visible.includes(s.key))
    .reduce((acc, s) => acc + widths[s.key], 0)
}

const VERSIONS = TABLE_COLUMNS.versions
const VERSIONS_DEFAULT: ColumnWidths = {
  round: 112,
  size: 88,
  uploader: 112,
  uploadedAt: 184,
  note: 200,
}

describe('storageKey', () => {
  // AC-1
  it.each([
    ['versions', 'dms.colWidths.versions'],
    ['trash', 'dms.colWidths.trash'],
    ['documents', 'dms.colWidths.documents'],
  ] as const)('AC-1: 표 %s 를 주면 %s 를 돌려줘야 한다', (table, expected) => {
    expect(storageKey(table)).toBe(expected)
  })
})

describe('defaultWidths', () => {
  it('버전 이력 열 정의를 주면 resizable 열의 기본 폭만 담아야 한다', () => {
    // Act
    const widths = defaultWidths(VERSIONS)

    // Assert
    expect(widths).toEqual(VERSIONS_DEFAULT)
  })

  it('휴지통·문서 목록 열 정의를 주면 resizable 열의 기본 폭만 담아야 한다', () => {
    expect(defaultWidths(TABLE_COLUMNS.trash)).toEqual({ size: 88, deletedAt: 104, actions: 208 })
    expect(defaultWidths(TABLE_COLUMNS.documents)).toEqual({
      version: 104,
      folder: 120,
      uploader: 112,
      size: 80,
      updatedAt: 96,
    })
  })
})

describe('parseStoredWidths — 원문 전체가 깨진 경우', () => {
  // AC-2
  it.each([null, '', '{깨진', '[]', '123', 'null', '"str"', '[1,2]', 'true'])(
    'AC-2: 저장 원문이 %j 이면 던지지 않고 기본 폭이어야 한다',
    (raw) => {
      // Act
      const run = () => parseStoredWidths(raw, VERSIONS)

      // Assert
      expect(run).not.toThrow()
      expect(run()).toEqual(defaultWidths(VERSIONS))
    },
  )

  it('AC-2: 세 표 모두 null 을 주면 각 표의 기본 폭이어야 한다', () => {
    for (const table of TABLES) {
      expect(parseStoredWidths(null, TABLE_COLUMNS[table])).toEqual(
        defaultWidths(TABLE_COLUMNS[table]),
      )
    }
  })
})

describe('parseStoredWidths — 키별 폴백과 범위', () => {
  // AC-3
  it('AC-3: 값이 문자열·null·boolean·객체인 키는 그 키만 기본 폭이어야 한다', () => {
    // Arrange
    const raw = JSON.stringify({
      round: '100',
      size: null,
      uploader: true,
      uploadedAt: {},
      note: 300,
    })

    // Act
    const widths = parseStoredWidths(raw, VERSIONS)

    // Assert
    expect(widths).toEqual({ round: 112, size: 88, uploader: 112, uploadedAt: 184, note: 300 })
  })

  it('AC-3: 범위 밖 값은 min·max 로 잘려야 한다', () => {
    // Arrange — round min 104 · note max 480 · size min 56
    const raw = JSON.stringify({ round: 1, note: 99999, size: -5, uploader: 240, uploadedAt: 112 })

    // Act
    const widths = parseStoredWidths(raw, VERSIONS)

    // Assert
    expect(widths).toEqual({ round: 104, size: 56, uploader: 240, uploadedAt: 112, note: 480 })
  })

  it('AC-3: 소수 값은 반올림돼야 한다', () => {
    // Act
    const widths = parseStoredWidths(JSON.stringify({ note: 100.6, size: 70.4 }), VERSIONS)

    // Assert
    expect(widths.note).toBe(101)
    expect(widths.size).toBe(70)
  })

  it('AC-3: 저장값에 없는 키는 기본 폭으로 채워야 한다', () => {
    // Act
    const widths = parseStoredWidths(JSON.stringify({ note: 300 }), VERSIONS)

    // Assert
    expect(widths).toEqual({ ...VERSIONS_DEFAULT, note: 300 })
  })

  it('AC-3: 빈 객체를 주면 기본 폭이어야 한다', () => {
    expect(parseStoredWidths('{}', VERSIONS)).toEqual(VERSIONS_DEFAULT)
  })
})

describe('clampWidth', () => {
  // AC-3
  it.each([NaN, Infinity, -Infinity])('AC-3: %s 를 주면 defaultWidth 여야 한다', (px) => {
    expect(clampWidth(resizableSpec('versions', 'note'), px)).toBe(200)
  })

  it('AC-3: 범위 안 소수는 반올림하고 범위 밖은 min·max 로 잘라야 한다', () => {
    // Arrange — note: min 72, max 480
    const note = resizableSpec('versions', 'note')

    // Act & Assert
    expect(clampWidth(note, 100.4)).toBe(100)
    expect(clampWidth(note, 100.5)).toBe(101)
    expect(clampWidth(note, 10)).toBe(72)
    expect(clampWidth(note, 1000)).toBe(480)
    expect(clampWidth(note, 72)).toBe(72)
    expect(clampWidth(note, 480)).toBe(480)
  })
})

describe('title·fixed·모르는 키 걸러내기', () => {
  // AC-4
  it('AC-4: 저장값에 title·fixed·모르는 키가 있어도 parse 결과에 없어야 한다', () => {
    // Arrange
    const raw = JSON.stringify({ ...VERSIONS_DEFAULT, file: 500, download: 99, foo: 1 })

    // Act
    const widths = parseStoredWidths(raw, VERSIONS)

    // Assert
    expect(Object.keys(widths).sort()).toEqual(['note', 'round', 'size', 'uploadedAt', 'uploader'])
  })

  it.each(TABLES)('AC-4: %s 표를 직렬화하면 키 집합이 정확히 resizable 열 키여야 한다', (table) => {
    // Arrange
    const specs = TABLE_COLUMNS[table]
    const titleKey = specs.find((s) => s.kind === 'title')!.key
    const fixedKeys = specs.filter((s) => s.kind === 'fixed').map((s) => s.key)
    const dirty: Record<string, number> = { ...defaultWidths(specs), [titleKey]: 500, foo: 1 }
    for (const k of fixedKeys) dirty[k] = 99

    // Act
    const parsed = JSON.parse(serializeWidths(dirty, specs)) as Record<string, unknown>

    // Assert
    expect(Object.keys(parsed).sort()).toEqual(resizable(specs).map((s) => s.key).sort())
  })

  it('AC-4: 직렬화 값은 입력 폭 그대로여야 한다', () => {
    // Act
    const parsed = JSON.parse(serializeWidths({ ...VERSIONS_DEFAULT, note: 333 }, VERSIONS))

    // Assert
    expect(parsed).toEqual({ ...VERSIONS_DEFAULT, note: 333 })
  })
})

describe('serialize → parse 왕복', () => {
  // AC-5
  it.each(TABLES)('AC-5: %s 표의 범위 안 폭은 왕복해도 같아야 한다', (table) => {
    // Arrange — min 과 max 사이의 기본값이 아닌 정수
    const specs = TABLE_COLUMNS[table]
    const w: Record<string, number> = {}
    for (const s of resizable(specs)) w[s.key] = Math.round(s.min + (s.max - s.min) / 3)

    // Act
    const back = parseStoredWidths(serializeWidths(w, specs), specs)

    // Assert
    expect(back).toEqual(w)
  })

  it.each(TABLES)('AC-5: %s 표의 min·max 경계값도 왕복해도 같아야 한다', (table) => {
    const specs = TABLE_COLUMNS[table]
    const lo: Record<string, number> = {}
    const hi: Record<string, number> = {}
    for (const s of resizable(specs)) {
      lo[s.key] = s.min
      hi[s.key] = s.max
    }

    expect(parseStoredWidths(serializeWidths(lo, specs), specs)).toEqual(lo)
    expect(parseStoredWidths(serializeWidths(hi, specs), specs)).toEqual(hi)
  })
})

describe('keyboardDelta', () => {
  // AC-6
  it('AC-6: RESIZE_STEP 은 16 이어야 한다', () => {
    expect(RESIZE_STEP).toBe(16)
  })

  it('AC-6: ArrowLeft 는 -16, ArrowRight 는 +16 이어야 한다', () => {
    expect(keyboardDelta('ArrowLeft')).toBe(-16)
    expect(keyboardDelta('ArrowRight')).toBe(16)
  })

  it.each(['ArrowUp', 'ArrowDown', 'Enter', 'a', ' ', 'Tab'])(
    'AC-6: %j 키는 0 이어야 한다',
    (key) => {
      expect(keyboardDelta(key)).toBe(0)
    },
  )
})

function brief(bs: Boundary[]) {
  return bs.map((b) => ({ afterKey: b.afterKey, targetKey: b.targetKey, sign: b.sign }))
}

describe('resizeBoundaries', () => {
  // AC-7
  it('AC-7: versions 전 열이 보이면 경계 5개가 정확한 target·sign 이어야 한다', () => {
    // Act
    const bs = resizeBoundaries(VERSIONS, allKeys(VERSIONS))

    // Assert
    expect(brief(bs)).toEqual([
      { afterKey: 'round', targetKey: 'round', sign: 1 },
      { afterKey: 'file', targetKey: 'size', sign: -1 },
      { afterKey: 'size', targetKey: 'uploader', sign: -1 },
      { afterKey: 'uploader', targetKey: 'uploadedAt', sign: -1 },
      { afterKey: 'uploadedAt', targetKey: 'note', sign: -1 },
    ])
  })

  it('AC-7: versions 에서 uploader 가 숨으면 size 다음 경계의 target 이 uploadedAt 이어야 한다', () => {
    // Arrange
    const visible = allKeys(VERSIONS).filter((k) => k !== 'uploader')

    // Act
    const bs = resizeBoundaries(VERSIONS, visible)

    // Assert
    expect(brief(bs)).toEqual([
      { afterKey: 'round', targetKey: 'round', sign: 1 },
      { afterKey: 'file', targetKey: 'size', sign: -1 },
      { afterKey: 'size', targetKey: 'uploadedAt', sign: -1 },
      { afterKey: 'uploadedAt', targetKey: 'note', sign: -1 },
    ])
    expect(bs.some((b) => b.afterKey === 'uploader' || b.targetKey === 'uploader')).toBe(false)
  })

  it('AC-7: trash 전 열이 보이면 제목 오른쪽부터 sign -1 경계 3개여야 한다', () => {
    const bs = resizeBoundaries(TABLE_COLUMNS.trash, allKeys(TABLE_COLUMNS.trash))

    expect(brief(bs)).toEqual([
      { afterKey: 'title', targetKey: 'size', sign: -1 },
      { afterKey: 'size', targetKey: 'deletedAt', sign: -1 },
      { afterKey: 'deletedAt', targetKey: 'actions', sign: -1 },
    ])
  })

  it('AC-7: trash 에서 size 가 숨으면 제목 오른쪽 경계 target 이 deletedAt 이어야 한다', () => {
    const visible = allKeys(TABLE_COLUMNS.trash).filter((k) => k !== 'size')

    const bs = resizeBoundaries(TABLE_COLUMNS.trash, visible)

    expect(brief(bs)).toEqual([
      { afterKey: 'title', targetKey: 'deletedAt', sign: -1 },
      { afterKey: 'deletedAt', targetKey: 'actions', sign: -1 },
    ])
  })

  it('AC-7: documents 전 열이 보이면 target 이 version·folder·uploader·size·updatedAt 순서이고 fixed 는 없어야 한다', () => {
    const specs = TABLE_COLUMNS.documents

    const bs = resizeBoundaries(specs, allKeys(specs))

    expect(bs.map((b) => b.targetKey)).toEqual(['version', 'folder', 'uploader', 'size', 'updatedAt'])
    expect(bs.every((b) => b.sign === -1)).toBe(true)
    expect(bs.map((b) => b.afterKey)).toEqual(['title', 'version', 'folder', 'uploader', 'size'])
  })

  it('documents 에서 md·lg 열이 숨으면(768px) 숨은 열은 어떤 경계에도 없어야 한다', () => {
    const specs = TABLE_COLUMNS.documents
    const visible = allKeys(specs).filter((k) => k !== 'folder' && k !== 'uploader')

    const bs = resizeBoundaries(specs, visible)

    expect(brief(bs)).toEqual([
      { afterKey: 'title', targetKey: 'version', sign: -1 },
      { afterKey: 'version', targetKey: 'size', sign: -1 },
      { afterKey: 'size', targetKey: 'updatedAt', sign: -1 },
    ])
  })
})

describe('applyBoundaryDelta', () => {
  // AC-8
  const ROUND: Boundary = { afterKey: 'round', targetKey: 'round', sign: 1 }
  const SIZE: Boundary = { afterKey: 'file', targetKey: 'size', sign: -1 }
  const ROOM = 10000

  it('AC-8: sign -1 경계를 +30 옮기면 target 이 30 줄어야 한다', () => {
    const next = applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, 30, VERSIONS, ROOM)

    expect(next.size).toBe(58)
  })

  it('AC-8: sign +1 경계를 +30 옮기면 target 이 30 늘어야 한다', () => {
    const next = applyBoundaryDelta(VERSIONS_DEFAULT, ROUND, 30, VERSIONS, ROOM)

    expect(next.round).toBe(142)
  })

  it('AC-8: sign -1 경계를 -30 옮기면 target 이 30 늘어야 한다', () => {
    const next = applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, -30, VERSIONS, ROOM)

    expect(next.size).toBe(118)
  })

  it('AC-8: min 아래로 가지 않아야 한다', () => {
    // size min 56, round min 104
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, 500, VERSIONS, ROOM).size).toBe(56)
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, ROUND, -500, VERSIONS, ROOM).round).toBe(104)
  })

  it('AC-8: max 위로 가지 않아야 한다', () => {
    // size max 160, round max 160
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, -500, VERSIONS, ROOM).size).toBe(160)
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, ROUND, 500, VERSIONS, ROOM).round).toBe(160)
  })

  it('AC-8: 늘리는 양이 titleRoom 을 넘으면 start + titleRoom 에서 멈춰야 한다', () => {
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, ROUND, 30, VERSIONS, 10).round).toBe(122)
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, -30, VERSIONS, 10).size).toBe(98)
  })

  it.each([0, -5])('AC-8: titleRoom 이 %i 이면 늘지 않아야 한다', (room) => {
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, ROUND, 30, VERSIONS, room).round).toBe(112)
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, -30, VERSIONS, room).size).toBe(88)
  })

  it.each([0, -5])('AC-8: titleRoom 이 %i 이어도 줄이는 것은 돼야 한다', (room) => {
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, 20, VERSIONS, room).size).toBe(68)
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, ROUND, -5, VERSIONS, room).round).toBe(107)
  })

  it('AC-8: 소수 이동량은 결과를 반올림해야 한다', () => {
    // 88 - 10.4 = 77.6
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, 10.4, VERSIONS, ROOM).size).toBe(78)
  })

  it('AC-8: target 외 키는 입력과 같고 입력 객체는 바뀌지 않아야 한다', () => {
    // Arrange
    const start = Object.freeze({ ...VERSIONS_DEFAULT })

    // Act
    const next = applyBoundaryDelta(start, SIZE, 30, VERSIONS, ROOM)

    // Assert
    expect(next).not.toBe(start)
    expect(start).toEqual(VERSIONS_DEFAULT)
    expect(next).toEqual({ ...VERSIONS_DEFAULT, size: 58 })
  })

  it('이동량이 0 이면 값이 그대로여야 한다', () => {
    expect(applyBoundaryDelta(VERSIONS_DEFAULT, SIZE, 0, VERSIONS, ROOM)).toEqual(VERSIONS_DEFAULT)
  })
})

describe('fitWidths', () => {
  // AC-9
  const ALL = allKeys(VERSIONS)

  it('AC-9: 합이 budget 이하면 widths 가 입력과 같고 titleWidth 가 남는 폭이어야 한다', () => {
    // Arrange — fixed 52, resizable 합 696
    // Act
    const { widths, titleWidth } = fitWidths(VERSIONS_DEFAULT, VERSIONS, ALL, 1166)

    // Assert
    expect(widths).toEqual(VERSIONS_DEFAULT)
    expect(titleWidth).toBe(1166 - 52 - 696)
  })

  it('AC-9: 합이 budget 과 정확히 같으면 그대로이고 titleWidth 가 TITLE_MIN_WIDTH 여야 한다', () => {
    const available = 696 + 96 + 52

    const { widths, titleWidth } = fitWidths(VERSIONS_DEFAULT, VERSIONS, ALL, available)

    expect(widths).toEqual(VERSIONS_DEFAULT)
    expect(titleWidth).toBe(96)
  })

  it('AC-9: 넘치면 각 열이 min 이상이고 제목이 TITLE_MIN_WIDTH 이상이며 합이 available 을 넘지 않아야 한다', () => {
    // Arrange — budget 600-96-52 = 452, 합 696, 최소 합 416
    const available = 600

    // Act
    const { widths, titleWidth } = fitWidths(VERSIONS_DEFAULT, VERSIONS, ALL, available)

    // Assert
    for (const s of resizable(VERSIONS)) {
      expect(widths[s.key]).toBeGreaterThanOrEqual(s.min)
      expect(widths[s.key]).toBeLessThanOrEqual(VERSIONS_DEFAULT[s.key])
    }
    expect(titleWidth).not.toBeNull()
    expect(titleWidth!).toBeGreaterThanOrEqual(TITLE_MIN_WIDTH)
    expect(52 + resizableSum(widths, VERSIONS, ALL) + titleWidth!).toBeLessThanOrEqual(available)
    expect(titleWidth).toBe(Math.max(0, available - 52 - resizableSum(widths, VERSIONS, ALL)))
  })

  it('AC-9: 넘친 양은 각 열의 (w - min) 비율로 나눠 줄여야 한다', () => {
    // Arrange — 넘침 244, 여유 round 8·size 32·uploader 40·uploadedAt 72·note 128 (합 280)
    const overflow = 696 - (600 - 96 - 52)
    const slack = 280

    // Act
    const { widths } = fitWidths(VERSIONS_DEFAULT, VERSIONS, ALL, 600)

    // Assert — 반올림 방식은 정하지 않았으므로 1px 오차까지 허용
    for (const s of resizable(VERSIONS)) {
      const w = VERSIONS_DEFAULT[s.key]
      const expected = w - (overflow * (w - s.min)) / slack
      expect(Math.abs(widths[s.key] - expected)).toBeLessThanOrEqual(1)
    }
  })

  it.each([
    [400, 0],
    [500, 32],
  ])('AC-9: 전부 min 이어도 넘치면(available %i) 전부 min 이고 titleWidth 가 %i 여야 한다', (available, title) => {
    // 최소 합 104+56+72+112+72 = 416
    const { widths, titleWidth } = fitWidths(VERSIONS_DEFAULT, VERSIONS, ALL, available)

    expect(widths).toEqual({ round: 104, size: 56, uploader: 72, uploadedAt: 112, note: 72 })
    expect(titleWidth).toBe(title)
  })

  it('AC-9: 숨은 열의 값은 입력 그대로이고 계산에서 빠져야 한다', () => {
    // Arrange — uploader 숨김, 넘치게
    const visible = ALL.filter((k) => k !== 'uploader')
    const input = { ...VERSIONS_DEFAULT, uploader: 240 }

    // Act
    const { widths, titleWidth } = fitWidths(input, VERSIONS, visible, 500)

    // Assert
    expect(widths.uploader).toBe(240)
    expect(titleWidth).toBe(Math.max(0, 500 - 52 - resizableSum(widths, VERSIONS, visible)))
    expect(52 + resizableSum(widths, VERSIONS, visible) + titleWidth!).toBeLessThanOrEqual(500)
  })

  it('AC-9: 숨은 열이 있고 넘치지 않으면 titleWidth 는 보이는 열만 뺀 값이어야 한다', () => {
    // uploader·uploadedAt 숨김 → 보이는 resizable 112+88+200 = 400
    const visible = ALL.filter((k) => k !== 'uploader' && k !== 'uploadedAt')

    const { widths, titleWidth } = fitWidths(VERSIONS_DEFAULT, VERSIONS, visible, 1166)

    expect(widths).toEqual(VERSIONS_DEFAULT)
    expect(titleWidth).toBe(1166 - 52 - 400)
  })

  it('숨은 fixed 열은 폭 계산에서 빠져야 한다', () => {
    const visible = ALL.filter((k) => k !== 'download')

    const { titleWidth } = fitWidths(VERSIONS_DEFAULT, VERSIONS, visible, 1166)

    expect(titleWidth).toBe(1166 - 696)
  })

  it.each([0, -10, NaN, Infinity])(
    'AC-9: available 이 %s 이면 titleWidth 가 null 이고 widths 가 입력 그대로여야 한다',
    (available) => {
      const input = { ...VERSIONS_DEFAULT, note: 300 }

      const { widths, titleWidth } = fitWidths(input, VERSIONS, ALL, available)

      expect(titleWidth).toBeNull()
      expect(widths).toEqual(input)
    },
  )

  it('입력 widths 객체를 바꾸지 않아야 한다', () => {
    const input = Object.freeze({ ...VERSIONS_DEFAULT })

    fitWidths(input, VERSIONS, ALL, 600)

    expect(input).toEqual(VERSIONS_DEFAULT)
  })
})

describe('열 정의 불변식과 산수', () => {
  // AC-10
  it('AC-10: TITLE_MIN_WIDTH 는 96 이어야 한다', () => {
    expect(TITLE_MIN_WIDTH).toBe(96)
  })

  it.each(TABLES)('AC-10: %s 표는 title 열이 하나, min<=default<=max, 키 중복 없음이어야 한다', (table) => {
    const specs = TABLE_COLUMNS[table]

    expect(specs.filter((s) => s.kind === 'title')).toHaveLength(1)
    for (const s of resizable(specs)) {
      expect(s.min).toBeLessThanOrEqual(s.defaultWidth)
      expect(s.defaultWidth).toBeLessThanOrEqual(s.max)
    }
    expect(new Set(allKeys(specs)).size).toBe(specs.length)
  })

  it('AC-10: documents 는 8열, trash actions min >= 200, versions note 는 resizable 이어야 한다', () => {
    expect(TABLE_COLUMNS.documents.length).toBe(8)
    expect(resizableSpec('trash', 'actions').min).toBeGreaterThanOrEqual(200)
    expect(spec('versions', 'note').kind).toBe('resizable')
  })

  it.each(TABLES)('AC-10: %s 표, 1166px·전 열·기본 폭이면 제목이 가장 넓어야 한다', (table) => {
    // Arrange
    const specs = TABLE_COLUMNS[table]
    const visible = allKeys(specs)

    // Act
    const { widths, titleWidth } = fitWidths(defaultWidths(specs), specs, visible, 1166)

    // Assert
    expect(titleWidth).not.toBeNull()
    for (const s of specs) {
      if (s.kind === 'resizable') expect(titleWidth!).toBeGreaterThan(widths[s.key])
      if (s.kind === 'fixed') expect(titleWidth!).toBeGreaterThan(s.width)
    }
  })

  it.each([
    ['versions', 418],
    ['trash', 766],
    ['documents', 550],
  ] as const)('AC-10: %s 표, 1166px·전 열·기본 폭이면 제목 폭이 %i 여야 한다', (table, expected) => {
    const specs = TABLE_COLUMNS[table]

    const { titleWidth } = fitWidths(defaultWidths(specs), specs, allKeys(specs), 1166)

    expect(titleWidth).toBe(expected)
  })

  it.each(TABLES)('AC-10: %s 표, 494px·lg 열 숨김·기본 폭이면 넘치지 않고 제목이 최소 폭 이상이어야 한다', (table) => {
    // Arrange
    const specs = TABLE_COLUMNS[table]
    const visible = specs.filter((s) => s.hideBelow !== 'lg').map((s) => s.key)

    // Act
    const { widths, titleWidth } = fitWidths(defaultWidths(specs), specs, visible, 494)

    // Assert
    expect(titleWidth).not.toBeNull()
    expect(fixedSum(specs, visible) + resizableSum(widths, specs, visible) + titleWidth!).toBeLessThanOrEqual(494)
    expect(titleWidth!).toBeGreaterThanOrEqual(TITLE_MIN_WIDTH)
  })
})

describe('숨김 클래스와 브레이크포인트', () => {
  // AC-11
  it('AC-11: COL_HIDE_CLASS·CELL_HIDE_CLASS 가 설계 리터럴과 같아야 한다', () => {
    expect(COL_HIDE_CLASS).toEqual({
      sm: 'hidden sm:table-column',
      md: 'hidden md:table-column',
      lg: 'hidden lg:table-column',
    })
    expect(CELL_HIDE_CLASS).toEqual({
      sm: 'hidden sm:table-cell',
      md: 'hidden md:table-cell',
      lg: 'hidden lg:table-cell',
    })
  })

  it.each([
    ['versions', { size: 'sm', uploader: 'lg', uploadedAt: 'md' }],
    ['trash', { size: 'sm' }],
    ['documents', { folder: 'md', uploader: 'lg', size: 'sm' }],
  ] as const)('AC-11: %s 표의 hideBelow 가 기존 td 숨김 클래스와 같아야 한다', (table, expected) => {
    // Act
    const actual: Record<string, string> = {}
    for (const s of TABLE_COLUMNS[table]) if (s.hideBelow) actual[s.key] = s.hideBelow

    // Assert
    expect(actual).toEqual(expected)
  })
})

describe('열 정의 값 (설계 §3.1)', () => {
  type Row = [key: string, label: string, kind: ColumnSpec['kind'], extra: object]

  const EXPECTED: Record<TableId, Row[]> = {
    versions: [
      ['round', '회차', 'resizable', { defaultWidth: 112, min: 104, max: 160 }],
      ['file', '파일', 'title', {}],
      ['size', '크기', 'resizable', { defaultWidth: 88, min: 56, max: 160 }],
      ['uploader', '올린 사람', 'resizable', { defaultWidth: 112, min: 72, max: 240 }],
      ['uploadedAt', '올린 시각', 'resizable', { defaultWidth: 184, min: 112, max: 240 }],
      ['note', '변경 메모', 'resizable', { defaultWidth: 200, min: 72, max: 480 }],
      ['download', '다운로드', 'fixed', { width: 52, srOnly: true }],
    ],
    trash: [
      ['title', '문서', 'title', {}],
      ['size', '크기', 'resizable', { defaultWidth: 88, min: 56, max: 160 }],
      ['deletedAt', '삭제', 'resizable', { defaultWidth: 104, min: 80, max: 200 }],
      ['actions', '복구', 'resizable', { defaultWidth: 208, min: 200, max: 320, srOnly: true }],
    ],
    documents: [
      ['title', '문서', 'title', {}],
      ['version', '버전', 'resizable', { defaultWidth: 104, min: 80, max: 200 }],
      ['folder', '폴더', 'resizable', { defaultWidth: 120, min: 72, max: 280 }],
      ['uploader', '올린 사람', 'resizable', { defaultWidth: 112, min: 72, max: 240 }],
      ['size', '크기', 'resizable', { defaultWidth: 80, min: 56, max: 140 }],
      ['updatedAt', '최근 업로드', 'resizable', { defaultWidth: 96, min: 80, max: 160 }],
      ['download', '다운로드', 'fixed', { width: 52, srOnly: true }],
      ['delete', '삭제', 'fixed', { width: 52, srOnly: true }],
    ],
  }

  it.each(TABLES)('%s 표의 열 순서·라벨·종류·폭이 설계 표와 같아야 한다', (table) => {
    const specs = TABLE_COLUMNS[table]

    expect(specs.map((s) => [s.key, s.label, s.kind])).toEqual(
      EXPECTED[table].map(([k, l, kind]) => [k, l, kind]),
    )
    EXPECTED[table].forEach(([, , , extra], i) => {
      expect(specs[i]).toMatchObject(extra)
    })
  })

  it.each(TABLES)('%s 표에서 srOnly 가 아닌 열은 srOnly 가 참이 아니어야 한다', (table) => {
    const srOnlyKeys = TABLE_COLUMNS[table].filter((s) => s.srOnly).map((s) => s.key)
    const expected = EXPECTED[table]
      .filter(([, , , extra]) => (extra as { srOnly?: boolean }).srOnly)
      .map(([k]) => k)

    expect(srOnlyKeys).toEqual(expected)
  })

  it('thClassName 이 기존 th 의 패딩·글꼴과 같아야 한다', () => {
    const cls = (t: TableId) => TABLE_COLUMNS[t].map((s) => s.thClassName)

    expect(cls('versions')).toEqual([
      ...Array(6).fill('px-4 py-2.5 font-medium'),
      'px-3 py-2.5',
    ])
    expect(cls('trash')).toEqual([
      'px-4 py-2.5 font-medium',
      'px-4 py-2.5 font-medium',
      'px-4 py-2.5 font-medium',
      'px-4 py-2.5',
    ])
    expect(cls('documents')).toEqual([
      'px-4 py-2.5 font-medium',
      ...Array(5).fill('px-3 py-2.5 font-medium'),
      'px-3 py-2.5',
      'px-3 py-2.5',
    ])
  })
})
