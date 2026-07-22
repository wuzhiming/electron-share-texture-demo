# Shared Texture Demo

演示四种将 Native GPU 渲染内容嵌入 Electron 窗口的方案，可运行时切换对比。

## 四种模式

### 1. sharedTexture（Electron >= 38）

```
Metal 渲染 → IOSurface → sharedTexture.importSharedTexture()
→ sendSharedTexture() → renderer getVideoFrame() → canvas.drawImage()
```

通过 Electron 的 `sharedTexture` API 以 GPU zero-copy 方式传递到 renderer 进程，绘制到 `<canvas>` 上。Canvas 是标准 DOM 元素，支持 CSS 布局、z-index、事件。

核心代码：[src/shared-texture-mode.js](src/shared-texture-mode.js)

### 2. NSView 挖孔（任意 Electron 版本）

```
Metal 渲染 → CAMetalLayer → getNativeWindowHandle() → addSubview
```

拿到 Electron 窗口的 `NSView*`，将 Metal 渲染的原生子视图直接嵌入。零拷贝，无版本限制，但原生视图浮在 DOM 之上。

核心代码：[src/embed-mode.js](src/embed-mode.js)、[native/platform/mac/embed_mac.mm](native/platform/mac/embed_mac.mm)

### 3. 窗口覆盖（任意 Electron 版本）

```
Metal 渲染 → 子 BrowserWindow(前, parent) → getNativeWindowHandle() → 挖孔
```

用 Electron 的 `new BrowserWindow({ parent })` 创建子窗口覆盖在 canvas 上方，在子窗口中用挖孔技术嵌入 Metal 渲染。子窗口作为 parent child 自动跟随父窗口移动。

核心代码：[src/overlay-mode.js](src/overlay-mode.js)

### 4. 透明穿透（任意 Electron 版本）

```
Metal 渲染 → 独立 BrowserWindow(后) → 挖孔
主窗口 transparent:true → canvas 区域 CSS 透明 → 后面的渲染穿透显示
```

主窗口设为 transparent，canvas 区域用 CSS 透明穿透。独立 BrowserWindow 放在后面，用挖孔技术嵌入 Metal 渲染，从透明区域透出来。可在渲染内容上方叠加 DOM 元素，但层级脆弱，需手动同步移动。

核心代码：[src/underlay-mode.js](src/underlay-mode.js)

## 项目结构

```
native/
├── platform.h                       # 平台无关接口（void*、float、uint32_t）
├── addon.cc                         # N-API 入口：纯 C++，只依赖 platform.h
├── platform/
│   ├── mac/
│   │   ├── renderer_mac.mm          # Metal + IOSurface + Shader
│   │   ├── embed_mac.mm             # 挖孔：MetalEmbedView + 原生鼠标事件
│   │   └── preview_mac.mm           # 参照预览窗口
│   └── win/
│       ├── renderer_win.cpp         # D3D11 + DXGI (TODO)
│       ├── embed_win.cpp            # HWND reparenting (TODO)
│       └── preview_win.cpp          # 预览窗口 (TODO)

src/
├── main.js                          # Electron 主进程：渲染循环 + 模式切换调度
├── shared-texture-mode.js           # 模式 1：sharedTexture import → send → release
├── embed-mode.js                    # 模式 2：挖孔 getNativeWindowHandle → embedView
├── overlay-mode.js                  # 模式 3：子 BrowserWindow(前) + 挖孔
├── underlay-mode.js                 # 模式 4：BrowserWindow(后) + transparent 穿透
├── preload.js                       # IPC 桥接
└── renderer.js                      # Renderer 进程：canvas 绘制 + UI 切换
```

## 环境要求

- macOS (arm64)，Xcode Command Line Tools 已安装
- Node.js >= 18
- npm

## 构建与运行

```bash
# 1. 安装依赖
npm install

# 2. 编译 native addon（自动对齐本地 Electron 版本和架构）
npm run build

# 3. 启动 demo
npm start
```

切换顶部四个 tab 对比不同方案，旁边的 "Native Metal (Direct)" 窗口作为参照。

### 常见问题

**编译失败 `no member named 'MTLCreateSystemDefaultDevice'`**
确保安装了 Xcode Command Line Tools：`xcode-select --install`

**运行时报 `NODE_MODULE_VERSION` 不匹配**
native addon 需要针对 Electron 的 Node 版本编译，重新执行 `npm run build`

**窗口没有出现渲染内容**
检查是否有 `ELECTRON_RUN_AS_NODE=1` 环境变量，如有请清除：`unset ELECTRON_RUN_AS_NODE`

## 方案对比

| | sharedTexture | NSView 挖孔 | 窗口覆盖 | 透明穿透 |
|---|---|---|---|---|
| 拷贝开销 | GPU zero-copy | 无 | 无 | 无 |
| Electron 版本 | >= 38 | 任意 | 任意 | 任意 |
| DOM 集成 | 完美 | 差 | 差 | 中（可叠 DOM） |
| 输入事件 | IPC 转发 | 原生处理 | IPC 转发 | IPC 转发 |
| 窗口跟随 | 不需要 | 自动 | 自动(parent) | 手动同步 |
| 层级稳定性 | 稳定 | 稳定 | 稳定 | 脆弱 |
| 跨平台 | 全平台 | 分平台 | 分平台 | 分平台 |
| native 创建窗口 | 否 | 否 | 否(JS) | 否(JS) |

## 平台

当前实现支持 macOS (arm64)。项目通过 `platform.h` 抽象层设计，Windows 实现需要：
- D3D11 + DXGI shared texture (NT Handle) 替代 Metal + IOSurface
- HWND reparenting (SetParent) 替代 NSView addSubview
