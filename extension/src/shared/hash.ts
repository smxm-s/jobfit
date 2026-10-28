/**
 * jdHash 口径必须与后端 HashUtil 一致：
 * sha256(title + company + jobUrl)，三段都先 trim，再做 UTF-8 字节哈希。
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function buildJdHash(title: string, company: string, jobUrl: string): Promise<string> {
  const text = `${(title ?? '').trim()}${(company ?? '').trim()}${(jobUrl ?? '').trim()}`
  return sha256Hex(text)
}
