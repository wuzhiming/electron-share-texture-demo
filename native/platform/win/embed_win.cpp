// ============================================================
// Windows 挖孔模式: HWND reparenting (TODO)
// ============================================================

#include "../../platform.h"

void PlatformEmbed(void* windowHandle, float x, float y, float w, float h) {
    // TODO: extract HWND, create child D3D11 render window via SetParent()
}

void PlatformRemoveEmbed() {
    // TODO
}

void PlatformUpdateEmbed(void* windowHandle, float x, float y, float w, float h) {
    // TODO: MoveWindow / SetWindowPos
}
