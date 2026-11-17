#pragma once
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <windowsx.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <wrl/client.h>
#include "../../platform.h"

using Microsoft::WRL::ComPtr;

// All D3D and HWND operations run on Electron's main thread.
struct WinRenderView {
    HWND window = nullptr;
    ComPtr<IDXGISwapChain1> swapChain;
    ComPtr<ID3D11RenderTargetView> target;
    UINT width = 0;
    UINT height = 0;
};

void WinCheck(HRESULT result, const char* operation);
void WinCreateView(WinRenderView& view, HWND window);
void WinDestroyView(WinRenderView& view);
void WinDrawView(WinRenderView& view);
LRESULT CALLBACK WinRenderWindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam);
void WinRegisterRenderWindow();
void WinRenderEmbed();
void WinRenderPreview();
constexpr wchar_t kRenderWindowClass[] = L"SharedTextureDemoD3D11";
