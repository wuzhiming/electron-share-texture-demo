# Shared Texture Demo

演示两种将 Native GPU 渲染内容嵌入 Electron 窗口的方案，可运行时切换对比。

## 两种模式

### 1. sharedTexture 模式（Electron >= 38）

```
Metal 渲染 → IOSurface → sharedTexture.importSharedTexture()
→ sendSharedTexture() → renderer getVideoFrame() → canvas.drawImage()
```

内容通过 Electron 的 `sharedTexture` API 以 GPU zero-copy 方式传递到 renderer 进程，最终绘制到 `<canvas>` 上。Canvas 是标准 DOM 元素，支持 CSS 布局、z-index、事件。

核心代码：[src/shared-texture-mode.js](src/shared-texture-mode.js)

### 2. NSView 挖孔模式（任意 Electron 版本）

```
Metal 渲染 → CAMetalLayer → NSView addSubview 到 Electron 窗口
```

通过 `getNativeWindowHandle()` 拿到 Electron 窗口的 `NSView*`，将一个 Metal 渲染的原生子视图直接嵌入。零拷贝，无版本限制，但原生视图浮在 DOM 之上，无法参与 CSS 布局。

核心代码：[src/embed-mode.js](src/embed-mode.js)、[native/embed_view.mm](native/embed_view.mm)

## 项目结构

```
native/
├── renderer_core.h        # 共享声明：Uniforms、全局变量、函数签名
├── renderer_core.mm       # Metal 核心：设备、管线、Shader、IOSurface
├── embed_view.mm          # 挖孔：MetalEmbedView + 原生鼠标事件
├── preview_window.mm      # 参照预览窗口（独立 NSWindow）
└── addon.mm               # N-API 入口：暴露 native 函数给 JS

src/
├── main.js                # Electron 主进程：渲染循环 + 模式切换
├── shared-texture-mode.js # sharedTexture 模式逻辑
├── embed-mode.js          # 挖孔模式逻辑
├── preload.js             # IPC 桥接
└── renderer.js            # Renderer 进程：canvas 绘制 + UI 切换
```

## 运行

```bash
npm install
node-gyp rebuild --target=$(node -e "console.log(require('./node_modules/electron/package.json').version)") \
  --arch=arm64 --dist-url=https://electronjs.org/headers
ELECTRON_RUN_AS_NODE= npx electron .
```

## 方案对比

| | sharedTexture | NSView 挖孔 |
|---|---|---|
| 拷贝开销 | GPU zero-copy | 无（直接渲染） |
| Electron 版本 | >= 38 | 任意 |
| DOM 集成 | 完美（canvas 在 DOM 中） | 差（浮在 DOM 上） |
| 输入事件 | 需 IPC 转发 | NSView 原生处理 |
| 跨平台 | 全平台 | 需分平台实现 |

## 平台

当前仅支持 macOS (arm64)。IOSurface 和 Metal 为 macOS 专有 API。
Windows 对应使用 DXGI shared texture + NT Handle，Linux 对应 dmabuf。
