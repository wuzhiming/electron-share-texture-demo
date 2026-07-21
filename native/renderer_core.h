#pragma once

#import <Metal/Metal.h>
#import <IOSurface/IOSurface.h>
#import <Cocoa/Cocoa.h>
#import <QuartzCore/CAMetalLayer.h>

// Uniform buffer passed to the fragment shader
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

// Shared global state — owned by renderer_core.mm
extern id<MTLDevice>              g_device;
extern id<MTLCommandQueue>        g_commandQueue;
extern id<MTLRenderPipelineState> g_pipelineState;
extern id<MTLTexture>             g_texture;      // IOSurface-backed texture
extern IOSurfaceRef               g_ioSurface;
extern uint32_t                   g_width;
extern uint32_t                   g_height;
extern Uniforms                   g_uniforms;

// renderer_core.mm
void InitMetal(uint32_t width, uint32_t height);
void DestroyMetal();
void RenderToTexture(id<MTLTexture> target, const Uniforms& uniforms);

// preview_window.mm
void CreatePreviewWindow(uint32_t width, uint32_t height);
void DestroyPreviewWindow();
void RenderPreview();

// embed_view.mm
void EmbedInView(NSView* parent, float x, float y, float w, float h);
void RemoveEmbed();
void UpdateEmbedFrame(NSView* parent, float x, float y, float w, float h);
void RenderEmbed();
