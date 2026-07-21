// ============================================================
// 挖孔模式 (NSView Embedding)
//
// 将一个 Metal 渲染的 NSView 直接作为子视图嵌入 Electron
// 窗口的 contentView 中。原生视图覆盖在 DOM 之上，
// 鼠标事件由 NSView 原生处理，不走 IPC。
// ============================================================

#import "renderer_core.h"

// ── Embedded view state ──

static NSView*      g_embedView  = nil;
static CAMetalLayer* g_embedLayer = nil;

// ── MetalEmbedView: 接收鼠标事件并更新 shader uniform ──

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
        g_uniforms.pressed  = 1.0f;
        g_uniforms.clickX   = x;
        g_uniforms.clickY   = y;
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
               owner:self
            userInfo:nil];
    [self addTrackingArea:ta];
}

@end

// ── Public functions ──

void EmbedInView(NSView* parent, float x, float y, float w, float h) {
    RemoveEmbed();

    // Cocoa 坐标系 Y 轴朝上，DOM Y 轴朝下，需要翻转
    float parentH = parent.bounds.size.height;
    float nativeY = parentH - y - h;

    g_embedView = [[MetalEmbedView alloc] initWithFrame:NSMakeRect(x, nativeY, w, h)];
    [g_embedView setWantsLayer:YES];

    g_embedLayer = [CAMetalLayer layer];
    g_embedLayer.device = g_device;
    g_embedLayer.pixelFormat = MTLPixelFormatBGRA8Unorm;
    g_embedLayer.drawableSize = CGSizeMake(g_width, g_height);
    g_embedLayer.framebufferOnly = YES;
    [g_embedView setLayer:g_embedLayer];

    [parent addSubview:g_embedView];
}

void RemoveEmbed() {
    if (g_embedView) {
        [g_embedView removeFromSuperview];
        g_embedView = nil;
        g_embedLayer = nil;
    }
}

void UpdateEmbedFrame(NSView* parent, float x, float y, float w, float h) {
    if (!g_embedView) return;
    float parentH = parent.bounds.size.height;
    float nativeY = parentH - y - h;
    [g_embedView setFrame:NSMakeRect(x, nativeY, w, h)];
}

void RenderEmbed() {
    if (!g_embedLayer || !g_embedView) return;
    id<CAMetalDrawable> drawable = [g_embedLayer nextDrawable];
    if (!drawable) return;
    RenderToTexture(drawable.texture, g_uniforms);
    id<MTLCommandBuffer> cmd = [g_commandQueue commandBuffer];
    [cmd presentDrawable:drawable];
    [cmd commit];
}
