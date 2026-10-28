/**
 * 内容脚本入口（classic script）。
 * MV3 的 content_scripts 不支持静态 ES module，因此这里用动态 import 加载编译后的模块。
 * dist/content/*.js 与 dist/shared/*.js 已在 manifest 的 web_accessible_resources 中声明。
 */
const path = location.pathname

async function boot(): Promise<void> {
  if (location.hostname !== 'www.zhipin.com') return
  try {
    if (path.includes('/job_detail/')) {
      const [detail, apply] = await Promise.all([
        import('./detail.js'),
        import('./apply.js')
      ])
      detail.init()
      apply.init()
      return
    }
    const isListPage =
      path.includes('/web/geek/job') ||
      /^\/c\d+/.test(path) ||
      path === '/' ||
      path === ''
    if (isListPage) {
      const list = await import('./list.js')
      list.init()
    }
  } catch (error) {
    console.warn('[JobFit] 内容脚本初始化失败', error)
  }
}

void boot()
