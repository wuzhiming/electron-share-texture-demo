// ============================================================
// N-API 入口 — 将 native 功能暴露给 JavaScript
// ============================================================

#import "renderer_core.h"
#include <napi.h>

// ── Init / Destroy ──

Napi::Value NapiInit(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    uint32_t w = info[0].As<Napi::Number>().Uint32Value();
    uint32_t h = info[1].As<Napi::Number>().Uint32Value();
    InitMetal(w, h);
    CreatePreviewWindow(w, h);
    return Napi::Boolean::New(env, true);
}

Napi::Value NapiDestroy(const Napi::CallbackInfo& info) {
    RemoveEmbed();
    DestroyPreviewWindow();
    DestroyMetal();
    return info.Env().Undefined();
}

// ── Render (called every frame from JS) ──

Napi::Value NapiRender(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() > 0)
        g_uniforms.time = info[0].As<Napi::Number>().FloatValue();

    @autoreleasepool {
        RenderToTexture(g_texture, g_uniforms);  // → IOSurface (for sharedTexture mode)
        RenderPreview();                          // → preview window (always)
        RenderEmbed();                            // → embedded view (挖孔 mode, if active)
    }

    // Return IOSurfaceRef pointer as Buffer (used by sharedTexture mode)
    Napi::Object result = Napi::Object::New(env);
    uintptr_t ptr = (uintptr_t)g_ioSurface;
    result.Set("ioSurfaceBuffer", Napi::Buffer<uint8_t>::Copy(env, reinterpret_cast<uint8_t*>(&ptr), sizeof(uintptr_t)));
    result.Set("width",  Napi::Number::New(env, g_width));
    result.Set("height", Napi::Number::New(env, g_height));
    return result;
}

// ── Input (sharedTexture mode — 挖孔 mode handles input natively in MetalEmbedView) ──

Napi::Value NapiSendInput(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
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
    return env.Undefined();
}

// ── Embed view (挖孔 mode) ──

Napi::Value NapiEmbedView(const Napi::CallbackInfo& info) {
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    NSView* parent = *reinterpret_cast<NSView**>(buf.Data());
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();
    float w = info[3].As<Napi::Number>().FloatValue();
    float h = info[4].As<Napi::Number>().FloatValue();
    EmbedInView(parent, x, y, w, h);
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Value NapiRemoveEmbed(const Napi::CallbackInfo& info) {
    RemoveEmbed();
    return info.Env().Undefined();
}

Napi::Value NapiUpdateEmbedFrame(const Napi::CallbackInfo& info) {
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    NSView* parent = *reinterpret_cast<NSView**>(buf.Data());
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();
    float w = info[3].As<Napi::Number>().FloatValue();
    float h = info[4].As<Napi::Number>().FloatValue();
    UpdateEmbedFrame(parent, x, y, w, h);
    return info.Env().Undefined();
}

// ── Module registration ──

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    exports.Set("init",             Napi::Function::New(env, NapiInit));
    exports.Set("destroy",          Napi::Function::New(env, NapiDestroy));
    exports.Set("render",           Napi::Function::New(env, NapiRender));
    exports.Set("sendInput",        Napi::Function::New(env, NapiSendInput));
    exports.Set("embedView",        Napi::Function::New(env, NapiEmbedView));
    exports.Set("removeEmbed",      Napi::Function::New(env, NapiRemoveEmbed));
    exports.Set("updateEmbedFrame", Napi::Function::New(env, NapiUpdateEmbedFrame));
    return exports;
}

NODE_API_MODULE(native_renderer, InitModule)
