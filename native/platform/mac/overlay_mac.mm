// ============================================================
// macOS 透明窗口叠放模式 (Overlay)
//
// 创建一个无边框 NSWindow + CAMetalLayer，作为 Electron
// 窗口的子窗口 (addChildWindow) 覆盖在 canvas 区域上。
// 子窗口始终保持在父窗口上方，并自动跟随父窗口移动。
// ============================================================

#import <Metal/Metal.h>
#import <Cocoa/Cocoa.h>
#import <QuartzCore/CAMetalLayer.h>
#include "../../platform.h"

extern id<MTLDevice>              g_device;
extern id<MTLCommandQueue>        g_commandQueue;
void MacRenderToTexture(id<MTLTexture> target, const Uniforms& uniforms);

static NSWindow*     s_overlayWindow = nil;
static CAMetalLayer* s_overlayLayer  = nil;
static NSWindow*     s_parentWindow  = nil;

// Electron 屏幕坐标 (Y↓) → Cocoa 屏幕坐标 (Y↑)
static NSRect ElectronRectToCocoa(float screenX, float screenY, float w, float h) {
    float screenH = [NSScreen mainScreen].frame.size.height;
    float cocoaY = screenH - screenY - h;
    return NSMakeRect(screenX, cocoaY, w, h);
}

static NSWindow* GetElectronWindow(void* windowHandle) {
    NSView* view = *reinterpret_cast<NSView**>(windowHandle);
    return [view window];
}

void PlatformCreateOverlay(void* windowHandle, float screenX, float screenY, float w, float h) {
    PlatformDestroyOverlay();

    NSRect frame = ElectronRectToCocoa(screenX, screenY, w, h);
    s_overlayWindow = [[NSWindow alloc] initWithContentRect:frame
                                                  styleMask:NSWindowStyleMaskBorderless
                                                    backing:NSBackingStoreBuffered
                                                      defer:NO];
    [s_overlayWindow setReleasedWhenClosed:NO];
    [s_overlayWindow setOpaque:YES];

    NSView* contentView = [s_overlayWindow contentView];
    [contentView setWantsLayer:YES];

    s_overlayLayer = [CAMetalLayer layer];
    s_overlayLayer.device = g_device;
    s_overlayLayer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    CGFloat scale = [[NSScreen mainScreen] backingScaleFactor];
    s_overlayLayer.contentsScale = scale;
    s_overlayLayer.drawableSize = CGSizeMake(w * scale, h * scale);
    s_overlayLayer.framebufferOnly = YES;
    [contentView setLayer:s_overlayLayer];

    // 绑为子窗口：始终在父窗口上方，跟随移动，点击父窗口不会遮挡
    s_parentWindow = GetElectronWindow(windowHandle);
    [s_parentWindow addChildWindow:s_overlayWindow ordered:NSWindowAbove];
}

void PlatformDestroyOverlay() {
    if (s_overlayWindow) {
        if (s_parentWindow) {
            [s_parentWindow removeChildWindow:s_overlayWindow];
            s_parentWindow = nil;
        }
        [s_overlayWindow orderOut:nil];
        s_overlayWindow = nil;
    }
    s_overlayLayer = nil;
}

void PlatformUpdateOverlay(void* windowHandle, float screenX, float screenY, float w, float h) {
    if (!s_overlayWindow) return;
    NSRect frame = ElectronRectToCocoa(screenX, screenY, w, h);
    [s_overlayWindow setFrame:frame display:YES];
    if (s_overlayLayer) {
        CGFloat scale = [[NSScreen mainScreen] backingScaleFactor];
        s_overlayLayer.drawableSize = CGSizeMake(w * scale, h * scale);
    }
}

void MacRenderOverlay() {
    if (!s_overlayLayer || !s_overlayWindow || ![s_overlayWindow isVisible]) return;
    id<CAMetalDrawable> drawable = [s_overlayLayer nextDrawable];
    if (!drawable) return;
    MacRenderToTexture(drawable.texture, g_uniforms);
    id<MTLCommandBuffer> cmd = [g_commandQueue commandBuffer];
    [cmd presentDrawable:drawable];
    [cmd commit];
}
