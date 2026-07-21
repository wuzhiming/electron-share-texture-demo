#import "renderer_core.h"
#import <Foundation/Foundation.h>

// ── Global state ──

id<MTLDevice>              g_device        = nil;
id<MTLCommandQueue>        g_commandQueue  = nil;
id<MTLRenderPipelineState> g_pipelineState = nil;
id<MTLTexture>             g_texture       = nil;
IOSurfaceRef               g_ioSurface     = NULL;
uint32_t                   g_width         = 0;
uint32_t                   g_height        = 0;
Uniforms                   g_uniforms      = {0, -1, -1, 0, 0, 0, -10, 0};

// ── Metal shader source ──

static const char* kShaderSource = R"(
#include <metal_stdlib>
using namespace metal;

struct VertexOut {
    float4 position [[position]];
    float2 uv;
};

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

vertex VertexOut vertexShader(uint vertexID [[vertex_id]]) {
    float2 positions[6] = {
        float2(-1, -1), float2(1, -1), float2(-1, 1),
        float2(-1, 1),  float2(1, -1), float2(1, 1)
    };
    float2 uvs[6] = {
        float2(0, 1), float2(1, 1), float2(0, 0),
        float2(0, 0), float2(1, 1), float2(1, 0)
    };
    VertexOut out;
    out.position = float4(positions[vertexID], 0.0, 1.0);
    out.uv = uvs[vertexID];
    return out;
}

fragment float4 fragmentShader(VertexOut in [[stage_in]],
                                constant Uniforms &u [[buffer(0)]]) {
    float2 uv = in.uv;

    // Background animation
    float r = sin(uv.x * 6.2832 * 2.0 + u.time * 2.0) * 0.5 + 0.5;
    float g = sin(uv.y * 6.2832 * 2.0 + u.time * 2.5 + 2.094) * 0.5 + 0.5;
    float b = sin((uv.x + uv.y) * 6.2832 * 1.5 + u.time * 1.8 + 4.189) * 0.5 + 0.5;

    float wave = sin(uv.x * 20.0 + u.time * 3.0) * sin(uv.y * 20.0 + u.time * 2.0) * 0.15;
    r += wave; g += wave * 0.8; b += wave * 0.6;

    float3 color = float3(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0));

    // Cursor ring at mouse position
    if (u.mouseX >= 0.0) {
        float2 mouseUV = float2(u.mouseX, u.mouseY);
        float dist = length(uv - mouseUV);
        float ring = smoothstep(0.022, 0.018, dist) - smoothstep(0.015, 0.011, dist);
        color = mix(color, float3(1.0), ring * 0.9);
        if (u.pressed > 0.5) {
            float dot = smoothstep(0.010, 0.006, dist);
            color = mix(color, float3(1.0), dot);
        }
    }

    // Click ripple
    float rippleAge = u.time - u.clickTime;
    if (rippleAge < 1.0 && rippleAge >= 0.0) {
        float2 clickUV = float2(u.clickX, u.clickY);
        float dist = length(uv - clickUV);
        float radius = rippleAge * 0.3;
        float ripple = smoothstep(radius + 0.008, radius, dist) - smoothstep(radius, radius - 0.008, dist);
        float fade = 1.0 - rippleAge;
        color = mix(color, float3(1.0), ripple * fade * 0.8);
    }

    return float4(color, 1.0);
}
)";

// ── Core functions ──

void RenderToTexture(id<MTLTexture> target, const Uniforms& uniforms) {
    id<MTLCommandBuffer> commandBuffer = [g_commandQueue commandBuffer];

    MTLRenderPassDescriptor* passDesc = [MTLRenderPassDescriptor renderPassDescriptor];
    passDesc.colorAttachments[0].texture = target;
    passDesc.colorAttachments[0].loadAction = MTLLoadActionClear;
    passDesc.colorAttachments[0].storeAction = MTLStoreActionStore;
    passDesc.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 1);

    id<MTLRenderCommandEncoder> encoder = [commandBuffer renderCommandEncoderWithDescriptor:passDesc];
    [encoder setRenderPipelineState:g_pipelineState];
    [encoder setFragmentBytes:&uniforms length:sizeof(Uniforms) atIndex:0];
    [encoder drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:6];
    [encoder endEncoding];

    [commandBuffer commit];
    [commandBuffer waitUntilCompleted];
}

void InitMetal(uint32_t width, uint32_t height) {
    g_width = width;
    g_height = height;

    // 1. Create IOSurface (shared texture backing store)
    NSDictionary* properties = @{
        (id)kIOSurfaceWidth:           @(g_width),
        (id)kIOSurfaceHeight:          @(g_height),
        (id)kIOSurfaceBytesPerElement: @4,
        (id)kIOSurfaceBytesPerRow:     @(g_width * 4),
        (id)kIOSurfaceAllocSize:       @(g_width * g_height * 4),
        (id)kIOSurfacePixelFormat:     @((uint32_t)'BGRA'),
    };
    g_ioSurface = IOSurfaceCreate((CFDictionaryRef)properties);

    // 2. Create Metal device and command queue
    g_device = MTLCreateSystemDefaultDevice();
    g_commandQueue = [g_device newCommandQueue];

    // 3. Create texture backed by the IOSurface
    MTLTextureDescriptor* texDesc = [MTLTextureDescriptor
        texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm
                                     width:g_width
                                    height:g_height
                                 mipmapped:NO];
    texDesc.usage = MTLTextureUsageRenderTarget | MTLTextureUsageShaderRead;
    texDesc.storageMode = MTLStorageModeShared;
    g_texture = [g_device newTextureWithDescriptor:texDesc iosurface:g_ioSurface plane:0];

    // 4. Compile shaders and create pipeline
    NSError* error = nil;
    id<MTLLibrary> library = [g_device newLibraryWithSource:[NSString stringWithUTF8String:kShaderSource]
                                                    options:nil
                                                      error:&error];
    id<MTLFunction> vertexFunc   = [library newFunctionWithName:@"vertexShader"];
    id<MTLFunction> fragmentFunc = [library newFunctionWithName:@"fragmentShader"];

    MTLRenderPipelineDescriptor* pipelineDesc = [[MTLRenderPipelineDescriptor alloc] init];
    pipelineDesc.vertexFunction  = vertexFunc;
    pipelineDesc.fragmentFunction = fragmentFunc;
    pipelineDesc.colorAttachments[0].pixelFormat = MTLPixelFormatBGRA8Unorm;
    g_pipelineState = [g_device newRenderPipelineStateWithDescriptor:pipelineDesc error:&error];
}

void DestroyMetal() {
    g_pipelineState = nil;
    g_texture = nil;
    g_commandQueue = nil;
    g_device = nil;
    if (g_ioSurface) { CFRelease(g_ioSurface); g_ioSurface = NULL; }
}
