图标占位说明：

本骨架版未声明 manifest 图标，Chrome 会使用默认扩展图标，不影响加载与运行。
如需自定义图标，把 128x128 的 PNG 命名为 icon128.png 放在本目录，并在 manifest.json 中增加：

  "icons": { "128": "icons/icon128.png" },
  "action": { "default_icon": { "128": "icons/icon128.png" } }

注意：图标只是品牌展示，不参与采集、打分与投递逻辑。
