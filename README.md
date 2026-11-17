# Shared Texture Demo

演示四种将 Native GPU 渲染内容嵌入 Electron 窗口的方案，可运行时切换对比。

## 四种模式

### 1. sharedTexture（Electron >= 38）

```
Metal / D3D11 渲染 → IOSurface / NT HANDLE → sharedTexture.importSharedTexture()
→ sendSharedTexture() → renderer getVideoFrame() → canvas.drawImage()
```

通过 Electron 的 `sharedTexture` API 以 GPU zero-copy 方式传递到 renderer 进程，绘制到 `<canvas>` 上。Canvas 是标准 DOM 元素，支持 CSS 布局、z-index、事件。

核心代码：[src/shared-texture-mode.js](src/shared-texture-mode.js)

### 2. NSView / HWND 挖孔（任意 Electron 版本）

```
Metal / D3D11 → CAMetalLayer / DXGI SwapChain → getNativeWindowHandle() → 原生子视图
```

macOS 使用 `NSView*` + CAMetalLayer；Windows 使用 `HWND` + 原生子窗口的 DXGI SwapChain。原生视图浮在 DOM 之上，不受 CSS z-index 控制。

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
│       ├── renderer_win.cpp         # D3D11 + HLSL + NT HANDLE + GPU 同步
│       ├── embed_win.cpp            # HWND 子窗口 + DPI 坐标转换
│       ├── preview_win.cpp          # 原生 D3D11 预览窗口
│       └── win_renderer.h           # Windows 内部设备与 SwapChain 接口

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

- macOS (arm64)，Xcode Command Line Tools 已安装（完整渲染功能）
- Node.js >= 22.12.0（Electron 43 安装工具要求）
- npm
- 编译 native addon 需要 Python；Windows 还需要 Visual Studio 的 C++ 桌面开发工具

Windows 10/11 支持四种模式，需要支持 D3D11 feature level 11.0 的硬件显卡与驱动。Windows 主窗口保留默认菜单栏；HWND 嵌入时根据网页内容区的屏幕原点转换坐标，补偿菜单栏偏移。菜单栏的可拖动空白通过 Windows 辅助功能接口读取实际按钮边界，再由窗口消息处理返回标题栏命中结果；不使用固定按钮宽度。系统移动/缩放期间暂停帧提交，结束后恢复渲染。

## 构建与运行

```bash
# 1. 安装依赖（不自动编译 native addon）
npm install

# 2. 编译 native addon（自动对齐本地 Electron 版本和当前 Node.js 架构）
npm run build

# 3. 启动 demo
npm start
```

切换顶部四个 tab 对比不同方案，旁边的 "Native Metal (Direct)" / "Native D3D11 (Direct)" 窗口作为参照。Windows 可直接拖动最上方白色菜单栏右侧的空白区域，也可拖动 "Shared Texture Demo" 标题区或渲染路径文字；File/Edit 等菜单项和模式按钮保留点击功能。Windows 可用 Alt+F4 退出。

### Windows 共享纹理实现

`renderer_win.cpp` 使用与 Metal 相同的 UV、波纹和鼠标效果，在 GPU 上将 HLSL 输出到 `DXGI_FORMAT_B8G8R8A8_UNORM` 纹理。纹理带有 `SHARED_NTHANDLE | SHARED_KEYEDMUTEX` 标记，由 `IDXGIResource1::CreateSharedHandle` 导出当前主进程可用的 NT HANDLE。

主进程通过 `handle.ntHandle` 导入，macOS 继续使用 `handle.ioSurface`。生产端使用 keyed mutex 与 GPU completion query 确认绘制完成；主循环等待 `allReferencesReleased` 后才绘制下一帧，退出时同样等待引用释放后再销毁设备和句柄。正常链路不回读像素到 CPU。

原生预览、HWND 嵌入、窗口覆盖和透明穿透使用同一套 D3D11 shader，并渲染到各自的 SwapChain。嵌入坐标从 CSS/DIP 按父窗口 DPI 转换为物理像素。透明穿透仍依赖窗口层级，不适合作为稳定的生产级合成方案；多显卡环境也需确保 Electron 与 addon 使用同一适配器。

API 参考：[Electron sharedTexture](https://www.electronjs.org/docs/latest/api/shared-texture)、[SharedTextureHandle](https://www.electronjs.org/docs/latest/api/structures/shared-texture-handle)、[Microsoft CreateSharedHandle](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgiresource1-createsharedhandle)。

### 验证

```bash
npm test              # 平台句柄选择、异步引用释放及错误路径
npm run test:windows  # 需 Windows 桌面与硬件 GPU；会短暂创建测试窗口
```

Windows 集成验证在 Electron 内加载 addon，将真实共享纹理送入 Canvas，并与 HLSL 的数学结果逐像素采样比较，验证 BGRA 通道、UV 方向和动画；同时覆盖原生视图缩放、快速切换、重复销毁及重新初始化。

### 常见问题

**安装或编译时报 `ModuleNotFoundError: No module named 'distutils'`**
旧版 `electron-rebuild` 引入的 `node-gyp 9` 不兼容 Python 3.12 及以上版本。
本项目已改用 `node-gyp 12`，并将依赖安装与编译分开。更新代码后执行 `npm install`，再执行 `npm run build`。

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

当前实现支持 macOS (arm64) 与 Windows。两者通过 `platform.h` 使用相同的 N-API 接口，分别由 Metal + IOSurface 和 D3D11 + NT HANDLE 实现。macOS 需在对应系统上构建与验证。
