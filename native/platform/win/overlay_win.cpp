// ============================================================
// Windows 透明窗口叠放 (TODO)
// ============================================================

#include "../../platform.h"

void PlatformCreateOverlay(void* windowHandle, float screenX, float screenY, float w, float h) {
    // TODO: CreateWindowEx with WS_EX_LAYERED, D3D11 swap chain
}

void PlatformDestroyOverlay() {
    // TODO
}

void PlatformUpdateOverlay(void* windowHandle, float screenX, float screenY, float w, float h) {
    // TODO: SetWindowPos
}
