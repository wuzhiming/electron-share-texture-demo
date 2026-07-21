// ============================================================
// macOS 挖孔模式: NSView 嵌入 Electron 窗口
// ============================================================

#import <Metal/Metal.h>
#import <Cocoa/Cocoa.h>
#import <QuartzCore/CAMetalLayer.h>
#include "../../platform.h"

// renderer_mac.mm 中定义
extern id<MTLDevice>              g_device;
extern id<MTLCommandQueue>        g_commandQueue;
extern id<MTLRenderPipelineState> g_pipelineState;
void MacRenderToTexture(id<MTLTexture> target, const Uniforms& uniforms);

static NSView*       s_embedView  = nil;
static CAMetalLayer* s_embedLayer = nil;

// ── MetalEmbedView: 原生鼠标事件 → shader uniform ──

@interface MetalEmbedView : NSView
@end

@implementation MetalEmbedView

- (BOOL)acceptsFirstResponder { return YES; }
- (BOOL)acceptsFirstMouse:(NSEvent*)event { return YES; }

- (void)updateMouseWithEvent:(NSEvent*)event pressed:(BOOL)p {
    NSPoint loc = [self convertPoint:[event locationInWindow] fromView:nil];
    NSSize size = self.bounds.size;
    float x = (float)(loc.x / size.width);
    float y = 1.0f - (float)(loc.y / size.height);
    g_uniforms.mouseX = x;
    g_uniforms.mouseY = y;
    if (p) {
        g_uniforms.pressed   = 1.0f;
        g_uniforms.clickX    = x;
        g_uniforms.clickY    = y;
        g_uniforms.clickTime = g_uniforms.time;
    }
}

- (void)mouseDown:(NSEvent*)e    { [self updateMouseWithEvent:e pressed:YES]; }
- (void)mouseUp:(NSEvent*)e     { g_uniforms.pressed = 0.0f; }
- (void)mouseDragged:(NSEvent*)e { [self updateMouseWithEvent:e pressed:NO]; }
- (void)mouseMoved:(NSEvent*)e   { [self updateMouseWithEvent:e pressed:NO]; }

- (void)mouseExited:(NSEvent*)e {
    g_uniforms.mouseX = -1.0f;
    g_uniforms.mouseY = -1.0f;
    g_uniforms.pressed = 0.0f;
}

- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    for (NSTrackingArea* area in self.trackingAreas)
        [self removeTrackingArea:area];
    NSTrackingArea* ta = [[NSTrackingArea alloc]
        initWithRect:self.bounds
             options:NSTrackingMouseMoved | NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways
               owner:self userInfo:nil];
    [self addTrackingArea:ta];
}

@end

// ── 坐标转换: DOM (Y↓) → Cocoa (Y↑) ──

static NSRect ConvertRect(NSView* parent, float x, float y, float w, float h) {
    float parentH = parent.bounds.size.height;
    return NSMakeRect(x, parentH - y - h, w, h);
}

// ── Platform 接口实现 ──

void PlatformEmbed(void* windowHandle, float x, float y, float w, float h) {
    PlatformRemoveEmbed();
    NSView* parent = *reinterpret_cast<NSView**>(windowHandle);

    s_embedView = [[MetalEmbedView alloc] initWithFrame:ConvertRect(parent, x, y, w, h)];
    [s_embedView setWantsLayer:YES];

    s_embedLayer = [CAMetalLayer layer];
    s_embedLayer.device = g_device;
    s_embedLayer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    s_embedLayer.drawableSize = CGSizeMake(w, h);
    s_embedLayer.framebufferOnly = YES;
    [s_embedView setLayer:s_embedLayer];

    [parent addSubview:s_embedView];
}

void PlatformRemoveEmbed() {
    if (s_embedView) {
        [s_embedView removeFromSuperview];
        s_embedView = nil;
        s_embedLayer = nil;
    }
}

void PlatformUpdateEmbed(void* windowHandle, float x, float y, float w, float h) {
    if (!s_embedView) return;
    NSView* parent = *reinterpret_cast<NSView**>(windowHandle);
    [s_embedView setFrame:ConvertRect(parent, x, y, w, h)];
}

void MacRenderEmbed() {
    if (!s_embedLayer || !s_embedView) return;
    id<CAMetalDrawable> drawable = [s_embedLayer nextDrawable];
    if (!drawable) return;
    MacRenderToTexture(drawable.texture, g_uniforms);
    id<MTLCommandBuffer> cmd = [g_commandQueue commandBuffer];
    [cmd presentDrawable:drawable];
    [cmd commit];
}
