// ============================================================
// macOS 预览窗口: NSWindow + CAMetalLayer (参照对比)
// ============================================================

#import <Metal/Metal.h>
#import <Cocoa/Cocoa.h>
#import <QuartzCore/CAMetalLayer.h>
#include "../../platform.h"

extern id<MTLDevice>              g_device;
extern id<MTLCommandQueue>        g_commandQueue;
void MacRenderToTexture(id<MTLTexture> target, const Uniforms& uniforms);

static NSWindow*     s_window     = nil;
static CAMetalLayer* s_metalLayer = nil;

void PlatformCreatePreview(uint32_t width, uint32_t height) {
    NSRect frame = NSMakeRect(100, 100, width, height);
    s_window = [[NSWindow alloc] initWithContentRect:frame
                                           styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
                                             backing:NSBackingStoreBuffered
                                               defer:NO];
    [s_window setTitle:@"Native Metal (Direct)"];
    [s_window setReleasedWhenClosed:NO];

    NSView* contentView = [s_window contentView];
    [contentView setWantsLayer:YES];

    s_metalLayer = [CAMetalLayer layer];
    s_metalLayer.device = g_device;
    s_metalLayer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    s_metalLayer.drawableSize = CGSizeMake(width, height);
    s_metalLayer.framebufferOnly = YES;
    [contentView setLayer:s_metalLayer];

    [s_window setLevel:NSFloatingWindowLevel];
    [s_window orderFrontRegardless];
    [NSApp activateIgnoringOtherApps:YES];
}

void PlatformDestroyPreview() {
    if (s_window) {
        [s_window close];
        s_window = nil;
    }
    s_metalLayer = nil;
}

void MacRenderPreview() {
    if (!s_metalLayer || !s_window || ![s_window isVisible]) return;
    id<CAMetalDrawable> drawable = [s_metalLayer nextDrawable];
    if (!drawable) return;
    MacRenderToTexture(drawable.texture, g_uniforms);
    id<MTLCommandBuffer> cmd = [g_commandQueue commandBuffer];
    [cmd presentDrawable:drawable];
    [cmd commit];
}
