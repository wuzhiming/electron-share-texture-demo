// ============================================================
// N-API 入口 — 纯 C++，只依赖 platform.h
//
// 不包含任何平台头文件（无 ObjC、无 Win32）。
// 所有平台特定逻辑由 platform/ 目录下的实现处理。
// ============================================================

#include "platform.h"
#include <napi.h>

Napi::Value NapiInit(const Napi::CallbackInfo& info) {
    uint32_t w = info[0].As<Napi::Number>().Uint32Value();
    uint32_t h = info[1].As<Napi::Number>().Uint32Value();
    PlatformInit(w, h);
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Value NapiDestroy(const Napi::CallbackInfo& info) {
    PlatformDestroy();
    return info.Env().Undefined();
}

Napi::Value NapiRender(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() > 0)
        g_uniforms.time = info[0].As<Napi::Number>().FloatValue();

    SharedTextureResult result = PlatformRender();

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("ioSurfaceBuffer",
            Napi::Buffer<uint8_t>::Copy(env,
                reinterpret_cast<const uint8_t*>(result.handleData),
                result.handleSize));
    obj.Set("width",  Napi::Number::New(env, result.width));
    obj.Set("height", Napi::Number::New(env, result.height));
    return obj;
}

Napi::Value NapiSendInput(const Napi::CallbackInfo& info) {
    std::string type = info[0].As<Napi::String>().Utf8Value();
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();

    g_uniforms.mouseX = x;
    g_uniforms.mouseY = y;

    if (type == "mousedown") {
        g_uniforms.pressed   = 1.0f;
        g_uniforms.clickX    = x;
        g_uniforms.clickY    = y;
        g_uniforms.clickTime = g_uniforms.time;
    } else if (type == "mouseup") {
        g_uniforms.pressed = 0.0f;
    } else if (type == "mouseleave") {
        g_uniforms.mouseX  = -1.0f;
        g_uniforms.mouseY  = -1.0f;
        g_uniforms.pressed = 0.0f;
    }
    return info.Env().Undefined();
}

Napi::Value NapiEmbedView(const Napi::CallbackInfo& info) {
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();
    float w = info[3].As<Napi::Number>().FloatValue();
    float h = info[4].As<Napi::Number>().FloatValue();
    PlatformEmbed(buf.Data(), x, y, w, h);
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Value NapiRemoveEmbed(const Napi::CallbackInfo& info) {
    PlatformRemoveEmbed();
    return info.Env().Undefined();
}

Napi::Value NapiUpdateEmbedFrame(const Napi::CallbackInfo& info) {
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();
    float w = info[3].As<Napi::Number>().FloatValue();
    float h = info[4].As<Napi::Number>().FloatValue();
    PlatformUpdateEmbed(buf.Data(), x, y, w, h);
    return info.Env().Undefined();
}

// ── Overlay (透明窗口叠放) ──

Napi::Value NapiCreateOverlay(const Napi::CallbackInfo& info) {
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();
    float w = info[3].As<Napi::Number>().FloatValue();
    float h = info[4].As<Napi::Number>().FloatValue();
    PlatformCreateOverlay(buf.Data(), x, y, w, h);
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Value NapiDestroyOverlay(const Napi::CallbackInfo& info) {
    PlatformDestroyOverlay();
    return info.Env().Undefined();
}

Napi::Value NapiUpdateOverlay(const Napi::CallbackInfo& info) {
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();
    float w = info[3].As<Napi::Number>().FloatValue();
    float h = info[4].As<Napi::Number>().FloatValue();
    PlatformUpdateOverlay(buf.Data(), x, y, w, h);
    return info.Env().Undefined();
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    exports.Set("init",             Napi::Function::New(env, NapiInit));
    exports.Set("destroy",          Napi::Function::New(env, NapiDestroy));
    exports.Set("render",           Napi::Function::New(env, NapiRender));
    exports.Set("sendInput",        Napi::Function::New(env, NapiSendInput));
    exports.Set("embedView",        Napi::Function::New(env, NapiEmbedView));
    exports.Set("removeEmbed",      Napi::Function::New(env, NapiRemoveEmbed));
    exports.Set("updateEmbedFrame", Napi::Function::New(env, NapiUpdateEmbedFrame));
    exports.Set("createOverlay",    Napi::Function::New(env, NapiCreateOverlay));
    exports.Set("destroyOverlay",   Napi::Function::New(env, NapiDestroyOverlay));
    exports.Set("updateOverlay",    Napi::Function::New(env, NapiUpdateOverlay));
    return exports;
}

NODE_API_MODULE(native_renderer, InitModule)
