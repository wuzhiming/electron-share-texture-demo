#include "win_renderer.h"
#include <d3dcompiler.h>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>

Uniforms g_uniforms = {0, -1, -1, 0, 0, 0, -10, 0};

static ComPtr<ID3D11Device> s_device;
static ComPtr<ID3D11DeviceContext> s_context;
static ComPtr<IDXGIFactory2> s_factory;
static ComPtr<ID3D11VertexShader> s_vertexShader;
static ComPtr<ID3D11PixelShader> s_pixelShader;
static ComPtr<ID3D11Buffer> s_uniformBuffer;
static ComPtr<ID3D11RasterizerState> s_rasterizer;
static ComPtr<ID3D11Texture2D> s_texture;
static ComPtr<ID3D11RenderTargetView> s_target;
static ComPtr<IDXGIKeyedMutex> s_mutex;
static ComPtr<ID3D11Query> s_completion;
static HANDLE s_sharedHandle = nullptr;
static uint32_t s_width = 0;
static uint32_t s_height = 0;

// Same UV orientation, animation and mouse effects as the Metal shader.
static const char* kShaderSource = R"(
cbuffer Uniforms : register(b0) {
    float time, mouseX, mouseY, pressed;
    float clickX, clickY, clickTime, pad;
};
struct VertexOut { float4 position : SV_POSITION; float2 uv : TEXCOORD0; };
VertexOut vertexShader(uint id : SV_VertexID) {
    float2 positions[6] = {
        float2(-1,-1), float2(1,-1), float2(-1,1),
        float2(-1,1), float2(1,-1), float2(1,1)
    };
    float2 uvs[6] = {
        float2(0,1), float2(1,1), float2(0,0),
        float2(0,0), float2(1,1), float2(1,0)
    };
    VertexOut o;
    o.position = float4(positions[id], 0, 1);
    o.uv = uvs[id];
    return o;
}
float falloff(float low, float high, float value) {
    return 1.0 - smoothstep(low, high, value);
}
float4 pixelShader(VertexOut input) : SV_TARGET {
    float2 uv = input.uv;
    float r = sin(uv.x * 6.2832 * 2.0 + time * 2.0) * 0.5 + 0.5;
    float g = sin(uv.y * 6.2832 * 2.0 + time * 2.5 + 2.094) * 0.5 + 0.5;
    float b = sin((uv.x + uv.y) * 6.2832 * 1.5 + time * 1.8 + 4.189) * 0.5 + 0.5;
    float wave = sin(uv.x * 20.0 + time * 3.0) * sin(uv.y * 20.0 + time * 2.0) * 0.15;
    float3 color = saturate(float3(r + wave, g + wave * 0.8, b + wave * 0.6));
    if (mouseX >= 0.0) {
        float dist = length(uv - float2(mouseX, mouseY));
        float ring = falloff(0.018, 0.022, dist) - falloff(0.011, 0.015, dist);
        color = lerp(color, float3(1,1,1), ring * 0.9);
        if (pressed > 0.5) color = lerp(color, float3(1,1,1), falloff(0.006, 0.010, dist));
    }
    float age = time - clickTime;
    if (age >= 0.0 && age < 1.0) {
        float dist = length(uv - float2(clickX, clickY));
        float radius = age * 0.3;
        float ripple = falloff(radius, radius + 0.008, dist) - falloff(radius - 0.008, radius, dist);
        color = lerp(color, float3(1,1,1), ripple * (1.0 - age) * 0.8);
    }
    return float4(color, 1);
}
)";

void WinCheck(HRESULT result, const char* operation) {
    if (FAILED(result)) {
        char code[32];
        std::snprintf(code, sizeof(code), " (HRESULT 0x%08lX)", static_cast<unsigned long>(result));
        throw std::runtime_error(std::string(operation) + code);
    }
}

static ComPtr<ID3DBlob> CompileShader(const char* entry, const char* profile) {
    ComPtr<ID3DBlob> code, errors;
    HRESULT result = D3DCompile(kShaderSource, std::strlen(kShaderSource), nullptr, nullptr,
        nullptr, entry, profile, D3DCOMPILE_ENABLE_STRICTNESS, 0, &code, &errors);
    if (FAILED(result) && errors) {
        throw std::runtime_error(std::string(static_cast<const char*>(errors->GetBufferPointer()), errors->GetBufferSize()));
    }
    WinCheck(result, "D3DCompile");
    return code;
}

static void Draw(ID3D11RenderTargetView* target, UINT width, UINT height) {
    D3D11_VIEWPORT viewport = {0, 0, static_cast<float>(width), static_cast<float>(height), 0, 1};
    s_context->RSSetViewports(1, &viewport);
    s_context->RSSetState(s_rasterizer.Get());
    s_context->OMSetRenderTargets(1, &target, nullptr);
    s_context->IASetInputLayout(nullptr);
    s_context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    s_context->VSSetShader(s_vertexShader.Get(), nullptr, 0);
    s_context->PSSetShader(s_pixelShader.Get(), nullptr, 0);
    ID3D11Buffer* constants = s_uniformBuffer.Get();
    s_context->PSSetConstantBuffers(0, 1, &constants);
    s_context->Draw(6, 0);
    s_context->OMSetRenderTargets(0, nullptr, nullptr);
}

void PlatformInit(uint32_t width, uint32_t height) {
    if (!width || !height || width > D3D11_REQ_TEXTURE2D_U_OR_V_DIMENSION || height > D3D11_REQ_TEXTURE2D_U_OR_V_DIMENSION) {
        throw std::runtime_error("Invalid D3D11 texture dimensions");
    }
    PlatformDestroy();
    try {
        const D3D_FEATURE_LEVEL levels[] = { D3D_FEATURE_LEVEL_11_0 };
        WinCheck(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels, 1, D3D11_SDK_VERSION,
            &s_device, nullptr, &s_context), "D3D11CreateDevice (hardware adapter required)");
        ComPtr<IDXGIDevice> dxgiDevice;
        ComPtr<IDXGIAdapter> adapter;
        WinCheck(s_device.As(&dxgiDevice), "Query IDXGIDevice");
        WinCheck(dxgiDevice->GetAdapter(&adapter), "GetAdapter");
        WinCheck(adapter->GetParent(IID_PPV_ARGS(&s_factory)), "Get IDXGIFactory2");

        auto vertexCode = CompileShader("vertexShader", "vs_5_0");
        auto pixelCode = CompileShader("pixelShader", "ps_5_0");
        WinCheck(s_device->CreateVertexShader(vertexCode->GetBufferPointer(), vertexCode->GetBufferSize(), nullptr, &s_vertexShader), "CreateVertexShader");
        WinCheck(s_device->CreatePixelShader(pixelCode->GetBufferPointer(), pixelCode->GetBufferSize(), nullptr, &s_pixelShader), "CreatePixelShader");
        static_assert(sizeof(Uniforms) == 32, "HLSL constant buffer layout must match");
        D3D11_BUFFER_DESC buffer = {};
        buffer.ByteWidth = sizeof(Uniforms);
        buffer.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
        WinCheck(s_device->CreateBuffer(&buffer, nullptr, &s_uniformBuffer), "Create uniform buffer");
        D3D11_RASTERIZER_DESC raster = {};
        raster.FillMode = D3D11_FILL_SOLID;
        raster.CullMode = D3D11_CULL_NONE;
        raster.DepthClipEnable = TRUE;
        WinCheck(s_device->CreateRasterizerState(&raster, &s_rasterizer), "CreateRasterizerState");

        D3D11_TEXTURE2D_DESC texture = {};
        texture.Width = s_width = width;
        texture.Height = s_height = height;
        texture.MipLevels = texture.ArraySize = 1;
        texture.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
        texture.SampleDesc.Count = 1;
        texture.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
        texture.MiscFlags = D3D11_RESOURCE_MISC_SHARED_NTHANDLE | D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX;
        WinCheck(s_device->CreateTexture2D(&texture, nullptr, &s_texture), "Create shared BGRA texture");
        WinCheck(s_device->CreateRenderTargetView(s_texture.Get(), nullptr, &s_target), "CreateRenderTargetView");
        WinCheck(s_texture.As(&s_mutex), "Query IDXGIKeyedMutex");
        ComPtr<IDXGIResource1> resource;
        WinCheck(s_texture.As(&resource), "Query IDXGIResource1");
        // Electron duplicates this process-local NT handle during import.
        WinCheck(resource->CreateSharedHandle(nullptr, DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE,
            nullptr, &s_sharedHandle), "CreateSharedHandle");
        D3D11_QUERY_DESC query = {D3D11_QUERY_EVENT, 0};
        WinCheck(s_device->CreateQuery(&query, &s_completion), "Create GPU completion query");
        g_uniforms = {0, -1, -1, 0, 0, 0, -10, 0};
        PlatformCreatePreview(width, height);
    } catch (...) {
        PlatformDestroy();
        throw;
    }
}

void PlatformDestroy() {
    PlatformRemoveMenuBarDrag();
    PlatformRemoveEmbed();
    PlatformDestroyPreview();
    if (s_context) { s_context->ClearState(); s_context->Flush(); }
    if (s_sharedHandle) { CloseHandle(s_sharedHandle); s_sharedHandle = nullptr; }
    s_completion.Reset();
    s_mutex.Reset();
    s_target.Reset();
    s_texture.Reset();
    s_rasterizer.Reset();
    s_uniformBuffer.Reset();
    s_vertexShader.Reset();
    s_pixelShader.Reset();
    s_factory.Reset();
    s_context.Reset();
    s_device.Reset();
    s_width = s_height = 0;
}

SharedTextureResult PlatformRender() {
    if (!s_device) throw std::runtime_error("Call init before rendering");
    HRESULT acquired = s_mutex->AcquireSync(0, 1000);
    // WAIT_TIMEOUT and WAIT_ABANDONED are positive HRESULTs, not FAILED().
    if (acquired != S_OK) throw std::runtime_error("Shared texture keyed mutex was not acquired");
    s_context->UpdateSubresource(s_uniformBuffer.Get(), 0, nullptr, &g_uniforms, 0, 0);
    Draw(s_target.Get(), s_width, s_height);
    WinCheck(s_mutex->ReleaseSync(0), "Release shared texture keyed mutex");
    // Flush submits work; this query additionally guarantees producer completion.
    s_context->End(s_completion.Get());
    s_context->Flush();
    const ULONGLONG deadline = GetTickCount64() + 2000;
    HRESULT ready;
    while ((ready = s_context->GetData(s_completion.Get(), nullptr, 0, 0)) == S_FALSE) {
        WinCheck(s_device->GetDeviceRemovedReason(), "D3D11 device removed");
        if (GetTickCount64() > deadline) throw std::runtime_error("D3D11 render completion timed out");
        Sleep(0);
    }
    WinCheck(ready, "Wait for shared texture rendering");
    WinRenderPreview();
    WinRenderEmbed();
    return { &s_sharedHandle, sizeof(s_sharedHandle), s_width, s_height };
}

void WinCreateView(WinRenderView& view, HWND window) {
    if (!s_device) throw std::runtime_error("Call init before creating a native view");
    WinDestroyView(view);
    view.window = window;
    DXGI_SWAP_CHAIN_DESC1 desc = {};
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    desc.BufferCount = 2;
    desc.SwapEffect = DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL;
    desc.Scaling = DXGI_SCALING_STRETCH;
    desc.AlphaMode = DXGI_ALPHA_MODE_IGNORE;
    WinCheck(s_factory->CreateSwapChainForHwnd(s_device.Get(), window, &desc, nullptr, nullptr, &view.swapChain), "CreateSwapChainForHwnd");
    s_factory->MakeWindowAssociation(window, DXGI_MWA_NO_ALT_ENTER);
}

void WinDestroyView(WinRenderView& view) {
    if (s_context) s_context->OMSetRenderTargets(0, nullptr, nullptr);
    view.target.Reset();
    view.swapChain.Reset();
    view.window = nullptr;
    view.width = view.height = 0;
}

void WinDrawView(WinRenderView& view) {
    if (!view.swapChain || !IsWindow(view.window) || !IsWindowVisible(view.window) || IsIconic(view.window)) return;
    RECT rect;
    GetClientRect(view.window, &rect);
    UINT width = rect.right - rect.left, height = rect.bottom - rect.top;
    if (!width || !height) return;
    if (width != view.width || height != view.height || !view.target) {
        view.target.Reset();
        WinCheck(view.swapChain->ResizeBuffers(0, width, height, DXGI_FORMAT_UNKNOWN, 0), "Resize swap chain");
        ComPtr<ID3D11Texture2D> backBuffer;
        WinCheck(view.swapChain->GetBuffer(0, IID_PPV_ARGS(&backBuffer)), "Get swap chain back buffer");
        WinCheck(s_device->CreateRenderTargetView(backBuffer.Get(), nullptr, &view.target), "Create swap chain target");
        view.width = width;
        view.height = height;
    }
    Draw(view.target.Get(), width, height);
    WinCheck(view.swapChain->Present(0, 0), "Present native view");
}

LRESULT CALLBACK WinRenderWindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_ERASEBKGND: return 1;
    case WM_PAINT: {
        PAINTSTRUCT paint;
        BeginPaint(window, &paint);
        EndPaint(window, &paint);
        return 0;
    }
    case WM_MOUSEMOVE:
    case WM_LBUTTONDOWN:
    case WM_LBUTTONUP: {
        RECT rect;
        GetClientRect(window, &rect);
        if (rect.right > 0 && rect.bottom > 0) {
            g_uniforms.mouseX = static_cast<float>(GET_X_LPARAM(lParam)) / rect.right;
            g_uniforms.mouseY = static_cast<float>(GET_Y_LPARAM(lParam)) / rect.bottom;
        }
        if (message == WM_LBUTTONDOWN) {
            SetCapture(window);
            g_uniforms.pressed = 1;
            g_uniforms.clickX = g_uniforms.mouseX;
            g_uniforms.clickY = g_uniforms.mouseY;
            g_uniforms.clickTime = g_uniforms.time;
        } else if (message == WM_LBUTTONUP) {
            ReleaseCapture();
            g_uniforms.pressed = 0;
        }
        TRACKMOUSEEVENT track = {sizeof(track), TME_LEAVE, window, 0};
        TrackMouseEvent(&track);
        return 0;
    }
    case WM_CAPTURECHANGED: g_uniforms.pressed = 0; return 0;
    case WM_MOUSELEAVE:
        if (GetCapture() != window) {
            g_uniforms.mouseX = g_uniforms.mouseY = -1;
            g_uniforms.pressed = 0;
        }
        return 0;
    case WM_CLOSE: DestroyWindow(window); return 0;
    case WM_DPICHANGED: {
        if (!(GetWindowLongPtrW(window, GWL_STYLE) & WS_CHILD)) {
            const RECT* suggested = reinterpret_cast<const RECT*>(lParam);
            SetWindowPos(window, nullptr, suggested->left, suggested->top,
                suggested->right - suggested->left, suggested->bottom - suggested->top,
                SWP_NOZORDER | SWP_NOACTIVATE);
        }
        return 0;
    }
    }
    return DefWindowProcW(window, message, wParam, lParam);
}

void WinRegisterRenderWindow() {
    static bool registered = false;
    if (registered) return;
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = WinRenderWindowProc;
    wc.hInstance = GetModuleHandleW(nullptr);
    wc.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(32512));
    wc.lpszClassName = kRenderWindowClass;
    if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
        throw std::runtime_error("Register render window class failed");
    }
    registered = true;
}
