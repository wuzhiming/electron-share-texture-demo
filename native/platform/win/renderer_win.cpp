// ============================================================
// Windows 渲染核心: D3D11 + DXGI shared texture (TODO)
// ============================================================

#include "../../platform.h"

Uniforms g_uniforms = {0, -1, -1, 0, 0, 0, -10, 0};

void PlatformInit(uint32_t width, uint32_t height) {
    // TODO: D3D11 device, DXGI shared texture, HLSL pipeline
}

void PlatformDestroy() {
    // TODO
}

SharedTextureResult PlatformRender() {
    // TODO: render to DXGI shared texture, return NT HANDLE
    return { nullptr, 0, 0, 0 };
}
