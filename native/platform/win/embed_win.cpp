#include "win_renderer.h"
#include <cmath>
#include <stdexcept>

static WinRenderView s_embed;
static HWND s_window = nullptr;

static void SetFrame(HWND parent, float x, float y, float width, float height, const EmbedContentOrigin* origin) {
    // Electron reports CSS/DIP coordinates; per-monitor-aware HWNDs use pixels.
    float scale = static_cast<float>(GetDpiForWindow(parent)) / 96.0f;
    POINT offset = {};
    if (origin) {
        offset = {origin->x, origin->y};
        if (!ScreenToClient(parent, &offset)) {
            throw std::runtime_error("Map web content origin to HWND client space failed");
        }
    }
    if (!SetWindowPos(s_window, HWND_TOP,
        offset.x + static_cast<int>(std::lround(x * scale)), offset.y + static_cast<int>(std::lround(y * scale)),
        static_cast<int>(std::lround(width * scale)), static_cast<int>(std::lround(height * scale)),
        SWP_NOACTIVATE | SWP_SHOWWINDOW)) {
        throw std::runtime_error("Position native child window failed");
    }
}

void PlatformEmbed(void* windowHandle, float x, float y, float width, float height, const EmbedContentOrigin* origin) {
    PlatformRemoveEmbed();
    HWND parent = *static_cast<HWND*>(windowHandle);
    if (!IsWindow(parent)) throw std::runtime_error("Invalid Electron HWND");
    WinRegisterRenderWindow();
    s_window = CreateWindowExW(0, kRenderWindowClass, L"D3D11 embedded view",
        WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
        0, 0, 1, 1, parent, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!s_window) throw std::runtime_error("Create native child window failed");
    try {
        SetFrame(parent, x, y, width, height, origin);
        WinCreateView(s_embed, s_window);
    } catch (...) {
        PlatformRemoveEmbed();
        throw;
    }
}

void PlatformRemoveEmbed() {
    WinDestroyView(s_embed);
    if (IsWindow(s_window)) DestroyWindow(s_window);
    s_window = nullptr;
}

void PlatformUpdateEmbed(void* windowHandle, float x, float y, float width, float height, const EmbedContentOrigin* origin) {
    if (!IsWindow(s_window)) return;
    HWND parent = *static_cast<HWND*>(windowHandle);
    if (!IsWindow(parent) || GetParent(s_window) != parent) return;
    SetFrame(parent, x, y, width, height, origin);
}

void WinRenderEmbed() { WinDrawView(s_embed); }
