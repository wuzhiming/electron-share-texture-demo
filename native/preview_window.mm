// ============================================================
// 参照预览窗口 (Native Metal Direct)
//
// 独立的 NSWindow + CAMetalLayer，渲染同样的内容，
// 作为对比参照。与两种模式无关，始终显示。
// ============================================================

#import "renderer_core.h"

static NSWindow*     g_window     = nil;
static CAMetalLayer* g_metalLayer = nil;

void CreatePreviewWindow(uint32_t width, uint32_t height) {
    NSRect frame = NSMakeRect(100, 100, width, height);
    g_window = [[NSWindow alloc] initWithContentRect:frame
                                           styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                                             backing:NSBackingStoreBuffered
                                               defer:NO];
    [g_window setTitle:@"Native Metal (Direct)"];
    [g_window setReleasedWhenClosed:NO];

    NSView* contentView = [g_window contentView];
    [contentView setWantsLayer:YES];

    g_metalLayer = [CAMetalLayer layer];
    g_metalLayer.device = g_device;
    g_metalLayer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    g_metalLayer.drawableSize = CGSizeMake(width, height);
    g_metalLayer.framebufferOnly = YES;
    [contentView setLayer:g_metalLayer];

    [g_window setLevel:NSFloatingWindowLevel];
    [g_window orderFrontRegardless];
    [NSApp activateIgnoringOtherApps:YES];
}

void DestroyPreviewWindow() {
    if (g_window) {
        [g_window close];
        g_window = nil;
    }
    g_metalLayer = nil;
}

void RenderPreview() {
    if (!g_metalLayer || !g_window || ![g_window isVisible]) return;
    id<CAMetalDrawable> drawable = [g_metalLayer nextDrawable];
    if (!drawable) return;
    RenderToTexture(drawable.texture, g_uniforms);
    id<MTLCommandBuffer> cmd = [g_commandQueue commandBuffer];
    [cmd presentDrawable:drawable];
    [cmd commit];
}
