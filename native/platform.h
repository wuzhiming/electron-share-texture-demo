#pragma once
#include <cstdint>
#include <cstddef>

// ============================================================
// Platform Abstraction Layer
//
// 平台无关的接口。addon.cc 只包含这个头文件。
// 具体实现在 platform/mac/ 或 platform/win/ 中。
//
// macOS: Metal + IOSurface + NSView
// Windows: D3D11 + DXGI shared texture + HWND (TODO)
// ============================================================

// Uniform buffer — 传给 fragment shader 的状态
struct Uniforms {
    float time;
    float mouseX;
    float mouseY;
    float pressed;
    float clickX;
    float clickY;
    float clickTime;
    float _pad;
};

extern Uniforms g_uniforms;

// Render 返回的共享纹理句柄
struct SharedTextureResult {
    const void* handleData;  // macOS: IOSurfaceRef 指针, Windows: NT HANDLE 指针
    size_t      handleSize;  // sizeof(uintptr_t)
    uint32_t    width;
    uint32_t    height;
};

// ── 生命周期 ──

void PlatformInit(uint32_t width, uint32_t height);
void PlatformDestroy();

// ── 渲染 ──

// 渲染一帧到所有激活的目标（IOSurface/DXGI + preview + embed）
SharedTextureResult PlatformRender();

// ── 挖孔 (Embed) ──

// windowHandle: getNativeWindowHandle() 返回的 Buffer.data()
// macOS 内部解释为 NSView**, Windows 内部解释为 HWND*
void PlatformEmbed(void* windowHandle, float x, float y, float w, float h);
void PlatformRemoveEmbed();
void PlatformUpdateEmbed(void* windowHandle, float x, float y, float w, float h);

// ── 预览窗口 ──

void PlatformCreatePreview(uint32_t width, uint32_t height);
void PlatformDestroyPreview();

// ── 透明窗口叠放 (Overlay) ──

// 创建一个无边框原生窗口，放在 Electron 窗口正后方
// windowHandle: Electron 窗口句柄（用于层级排序）
// screenX/Y: Electron 屏幕坐标（Y 向下）
void PlatformCreateOverlay(void* windowHandle, float screenX, float screenY, float w, float h);
void PlatformDestroyOverlay();
void PlatformUpdateOverlay(void* windowHandle, float screenX, float screenY, float w, float h);
