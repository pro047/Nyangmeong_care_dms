/**
 * presigned PUT은 진행률이 필요해 fetch 대신 XHR을 쓴다.
 *
 * onStart 로 xhr 을 밖에 넘기는 이유: 멈춘 업로드를 취소할 수단이 필요하다.
 * xhr.timeout 으로 숫자를 정하지 않은 것은 의도다 — 100MB를 느린 회선으로 올리면
 * 멀쩡한 업로드가 그 숫자에 걸려 죽는다. 판단은 사람이 한다.
 *
 * 브라우저에서만 돌아간다. 여기에 @/lib/env·@/lib/s3 를 끌어오면 서버 전용 코드가
 * 클라이언트 번들로 딸려 들어간다.
 */
export function putToS3(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
  onStart: (xhr: XMLHttpRequest) => void,
  isCancelled: () => boolean,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    onStart(xhr)
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`S3 업로드 실패 (${xhr.status})`))
    xhr.onerror = () => reject(new Error('네트워크 오류'))
    xhr.onabort = () => reject(new Error('업로드를 취소했습니다.'))
    // 마지막 문 직전의 동기 검사. runUploadFlow 도 put 직전에 보지만, 그 검사와 여기 사이에
    // 언젠가 await 가 끼면 구멍이 조용히 다시 열린다. 그 전제에 기대지 않으려고 둔다.
    if (isCancelled()) return reject(new Error('업로드를 취소했습니다.'))
    xhr.send(file)
  })
}
