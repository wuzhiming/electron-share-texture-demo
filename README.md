# Shared Texture Demo

演示三种将 Native GPU 渲染内容嵌入 Electron 窗口的方案，可运行时切换对比。

## 三种模式

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

核心代码：[src/embed-mode.js](src/embed-mode.js)、[native/platform/mac/embed_mac.mm](native/platform/mac/embed_mac.mm)

### 3. 透明窗口叠放模式（任意 Electron 版本）

```
Metal 渲染 → CAMetalLayer → 独立 NSWindow (addChildWindow) 覆盖在 canvas 区域
```

创建一个无边框原生窗口，作为 Electron 窗口的子窗口覆盖在 canvas 区域上。子窗口自动跟随父窗口移动，但缩放时需要手动同步位置，且是独立窗口无法参与 DOM 布局。

核心代码：[src/overlay-mode.js](src/overlay-mode.js)、[native/platform/mac/overlay_mac.mm](native/platform/mac/overlay_mac.mm)

## 项目结构

```
native/
├── platform.h                       # 平台无关接口（void*、float、uint32_t）
├── addon.cc                         # N-API 入口：纯 C++，只依赖 platform.h
├── platform/
│   ├── mac/
│   │   ├── renderer_mac.mm          # Metal + IOSurface + Shader
│   │   ├── embed_mac.mm             # 挖孔：MetalEmbedView + 原生鼠标事件
│   │   ├── overlay_mac.mm           # 透明窗口：子窗口 + CAMetalLayer
│   │   └── preview_mac.mm           # 参照预览窗口
│   └── win/
│       ├── renderer_win.cpp         # D3D11 + DXGI (TODO)
│       ├── embed_win.cpp            # HWND reparenting (TODO)
│       ├── overlay_win.cpp          # 窗口叠放 (TODO)
│       └── preview_win.cpp          # 预览窗口 (TODO)

src/
├── main.js                          # Electron 主进程：渲染循环 + 模式切换调度
├── shared-texture-mode.js           # sharedTexture 模式：import → send → release
├── embed-mode.js                    # 挖孔模式：getNativeWindowHandle → embedView
├── overlay-mode.js                  # 透明窗口模式：createOverlay → child window
├── preload.js                       # IPC 桥接
└── renderer.js                      # Renderer 进程：canvas 绘制 + UI 切换
```

## 运行

```bash
npm install
node-gyp rebuild --target=$(node -e "console.log(require('./node_modules/electron/package.json').version)") \
  --arch=arm64 --dist-url=https://electronjs.org/headers
ELECTRON_RUN_AS_NODE= npx electron .
```

## 方案对比

| | sharedTexture | NSView 挖孔 | 透明窗口叠放 |
|---|---|---|---|
| 拷贝开销 | GPU zero-copy | 无（直接渲染） | 无（直接渲染） |
| Electron 版本 | >= 38 | 任意 | 任意 |
| DOM 集成 | 完美（canvas 在 DOM 中） | 差（浮在 DOM 上） | 差（独立窗口） |
| 输入事件 | 需 IPC 转发 | NSView 原生处理 | 需 IPC 转发 |
| 窗口跟随 | 不需要 | 自动（子视图） | 自动（子窗口） |
| 缩放适配 | 自动 | 需手动同步 | 需手动同步 |
| 跨平台 | 全平台 | 需分平台实现 | 需分平台实现 |

## 平台

当前实现支持 macOS (arm64)。IOSurface 和 Metal 为 macOS 专有 API。

项目通过 `platform.h` 抽象层设计，Windows 实现需要：
- D3D11 + DXGI shared texture (NT Handle) 替代 Metal + IOSurface
- HWND reparenting (SetParent) 替代 NSView addSubview
- SetWindowPos 替代 addChildWindow
