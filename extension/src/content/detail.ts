import {
  absoluteUrl,
  isVisible,
  loadSelectors,
  normalizeText,
  queryAll,
  queryFirst,
  textOf,
  wait,
  waitForElement
} from '../shared/selectors.js'
import type { BgResponse, DetailPayload, RuntimeMessage, SelectorSet } from '../shared/types.js'

let selectors: SelectorSet

export function init(): void {
  void main()
}

async function main(): Promise<void> {
  try {
    selectors = await loadSelectors()
    await wait(900)

    if (captchaDetected()) {
      void ask({ type: 'CAPTCHA_DETECTED', where: 'DETAIL' })
      return
    }

    const jdElement = await waitForElement(selectors.detail.jd, 8000)
    const jdRaw = jdElement instanceof HTMLElement ? jdElement.innerText : jdElement?.textContent ?? ''
    const jdText = jdRaw.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000)

    const payload: DetailPayload = {
      jobUrl: absoluteUrl(location.href),
      title: textOf(document, selectors.detail.title),
      company: textOf(document, selectors.detail.company),
      salary: textOf(document, selectors.detail.salary),
      city: textOf(document, selectors.detail.city),
      tags: queryAll(document, selectors.detail.tags)
        .map((element) => normalizeText(element.textContent))
        .filter(Boolean)
        .slice(0, 12),
      jdText,
      jdLength: jdText.length
    }
    // JD 全文只回传给背景页做当前任务参考，不落库、不上传
    void ask({ type: 'DETAIL_READY', detail: payload })

    const loggedIn = detectLogin()
    void ask({ type: 'LOGIN_STATE', loggedIn })
  } catch (error) {
    console.warn('[JobFit] 详情页初始化失败', error)
  }
}

function detectLogin(): boolean {
  if (selectors.login.loggedIn?.some((selector) => isVisible(queryFirst(document, [selector])))) return true
  if (selectors.login.loginDialog?.some((selector) => isVisible(queryFirst(document, [selector])))) return false
  if (selectors.login.loginEntry?.some((selector) => isVisible(queryFirst(document, [selector])))) return false
  return true
}

function captchaDetected(): boolean {
  if (selectors.captcha.container?.some((selector) => isVisible(queryFirst(document, [selector])))) {
    return true
  }
  return /验证|安全验证/.test(document.title)
}

async function ask(message: RuntimeMessage): Promise<void> {
  try {
    await (chrome.runtime.sendMessage(message) as Promise<BgResponse | undefined>)
  } catch {
    // 背景页未就绪时忽略，等待下次页面加载
  }
}
