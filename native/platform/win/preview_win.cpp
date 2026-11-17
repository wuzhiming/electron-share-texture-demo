#include "win_renderer.h"
#include <stdexcept>

static WinRenderView s_preview;
static HWND s_window = nullptr;

void PlatformCreatePreview(uint32_t width, uint32_t height) {
    PlatformDestroyPreview();
    WinRegisterRenderWindow();
    RECT rect = {0, 0, static_cast<LONG>(width), static_cast<LONG>(height)};
    AdjustWindowRectEx(&rect, WS_OVERLAPPEDWINDOW, FALSE, 0);
    s_window = CreateWindowExW(0, kRenderWindowClass, L"Native D3D11 (Direct)",
        WS_OVERLAPPEDWINDOW, 80, 80, rect.right - rect.left, rect.bottom - rect.top,
        nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    if (!s_window) throw std::runtime_error("Create D3D11 preview window failed");
    try {
        WinCreateView(s_preview, s_window);
        ShowWindow(s_window, SW_SHOWNOACTIVATE);
    } catch (...) {
        PlatformDestroyPreview();
        throw;
    }
}

void PlatformDestroyPreview() {
    WinDestroyView(s_preview);
    if (IsWindow(s_window)) DestroyWindow(s_window);
    s_window = nullptr;
}

void WinRenderPreview() { WinDrawView(s_preview); }
