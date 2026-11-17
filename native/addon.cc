// ============================================================
// N-API 入口 — 纯 C++，只依赖 platform.h
//
// 不包含任何平台头文件（无 ObjC、无 Win32）。
// 所有平台特定逻辑由 platform/ 目录下的实现处理。
// ============================================================

#include "platform.h"
#include <napi.h>
#include <exception>

// D3D/Win32 failures become JavaScript errors instead of escaping the N-API ABI.
template <Napi::Value (*Callback)(const Napi::CallbackInfo&)>
Napi::Value GuardCallback(const Napi::CallbackInfo& info) {
#ifdef _WIN32
    try {
        return Callback(info);
    } catch (const std::exception& error) {
        Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException();
        return info.Env().Undefined();
    }
#else
    return Callback(info);
#endif
}

Napi::Value NapiInit(const Napi::CallbackInfo& info) {
    if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
        Napi::TypeError::New(info.Env(), "init requires width and height").ThrowAsJavaScriptException();
        return info.Env().Undefined();
    }
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
    obj.Set("textureHandle",
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
    if (info.Length() < 5 || !info[0].IsBuffer() || info[0].As<Napi::Buffer<uint8_t>>().Length() < sizeof(uintptr_t)) {
        Napi::TypeError::New(info.Env(), "embedView requires a native window handle buffer and rectangle").ThrowAsJavaScriptException();
        return info.Env().Undefined();
    }
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();
    float w = info[3].As<Napi::Number>().FloatValue();
    float h = info[4].As<Napi::Number>().FloatValue();
    EmbedContentOrigin origin;
    const EmbedContentOrigin* contentOrigin = nullptr;
    if (info.Length() > 5 && info[5].IsObject()) {
        auto value = info[5].As<Napi::Object>();
        if (!value.Get("x").IsNumber() || !value.Get("y").IsNumber()) {
            Napi::TypeError::New(info.Env(), "content origin requires numeric x and y").ThrowAsJavaScriptException();
            return info.Env().Undefined();
        }
        origin = {value.Get("x").As<Napi::Number>().Int32Value(), value.Get("y").As<Napi::Number>().Int32Value()};
        contentOrigin = &origin;
    }
    PlatformEmbed(buf.Data(), x, y, w, h, contentOrigin);
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Value NapiRemoveEmbed(const Napi::CallbackInfo& info) {
    PlatformRemoveEmbed();
    return info.Env().Undefined();
}

Napi::Value NapiUpdateEmbedFrame(const Napi::CallbackInfo& info) {
    if (info.Length() < 5 || !info[0].IsBuffer() || info[0].As<Napi::Buffer<uint8_t>>().Length() < sizeof(uintptr_t)) {
        Napi::TypeError::New(info.Env(), "updateEmbedFrame requires a native window handle buffer and rectangle").ThrowAsJavaScriptException();
        return info.Env().Undefined();
    }
    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    float x = info[1].As<Napi::Number>().FloatValue();
    float y = info[2].As<Napi::Number>().FloatValue();
    float w = info[3].As<Napi::Number>().FloatValue();
    float h = info[4].As<Napi::Number>().FloatValue();
    EmbedContentOrigin origin;
    const EmbedContentOrigin* contentOrigin = nullptr;
    if (info.Length() > 5 && info[5].IsObject()) {
        auto value = info[5].As<Napi::Object>();
        if (!value.Get("x").IsNumber() || !value.Get("y").IsNumber()) {
            Napi::TypeError::New(info.Env(), "content origin requires numeric x and y").ThrowAsJavaScriptException();
            return info.Env().Undefined();
        }
        origin = {value.Get("x").As<Napi::Number>().Int32Value(), value.Get("y").As<Napi::Number>().Int32Value()};
        contentOrigin = &origin;
    }
    PlatformUpdateEmbed(buf.Data(), x, y, w, h, contentOrigin);
    return info.Env().Undefined();
}

#ifdef _WIN32
Napi::Value NapiConfigureMenuBarDrag(const Napi::CallbackInfo& info) {
    if (info.Length() < 1 || !info[0].IsBuffer() || info[0].As<Napi::Buffer<uint8_t>>().Length() < sizeof(uintptr_t)) {
        Napi::TypeError::New(info.Env(), "configureMenuBarDrag requires a native window handle buffer").ThrowAsJavaScriptException();
        return info.Env().Undefined();
    }
    auto rect = PlatformConfigureMenuBarDrag(info[0].As<Napi::Buffer<uint8_t>>().Data());
    auto result = Napi::Object::New(info.Env());
    result.Set("x", rect.x);
    result.Set("y", rect.y);
    result.Set("width", rect.width);
    result.Set("height", rect.height);
    return result;
}

Napi::Value NapiBeginWindowDrag(const Napi::CallbackInfo& info) {
    if (info.Length() < 1 || !info[0].IsBuffer() || info[0].As<Napi::Buffer<uint8_t>>().Length() < sizeof(uintptr_t)) {
        Napi::TypeError::New(info.Env(), "beginWindowDrag requires a native window handle buffer").ThrowAsJavaScriptException();
        return info.Env().Undefined();
    }
    PlatformBeginWindowDrag(info[0].As<Napi::Buffer<uint8_t>>().Data());
    return info.Env().Undefined();
}
#endif

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
#ifdef _WIN32
    exports.Set("beginWindowDrag", Napi::Function::New(env, GuardCallback<NapiBeginWindowDrag>));
    exports.Set("configureMenuBarDrag", Napi::Function::New(env, GuardCallback<NapiConfigureMenuBarDrag>));
#endif
    exports.Set("init",             Napi::Function::New(env, GuardCallback<NapiInit>));
    exports.Set("destroy",          Napi::Function::New(env, GuardCallback<NapiDestroy>));
    exports.Set("render",           Napi::Function::New(env, GuardCallback<NapiRender>));
    exports.Set("sendInput",        Napi::Function::New(env, GuardCallback<NapiSendInput>));
    exports.Set("embedView",        Napi::Function::New(env, GuardCallback<NapiEmbedView>));
    exports.Set("removeEmbed",      Napi::Function::New(env, GuardCallback<NapiRemoveEmbed>));
    exports.Set("updateEmbedFrame", Napi::Function::New(env, GuardCallback<NapiUpdateEmbedFrame>));
    return exports;
}

NODE_API_MODULE(native_renderer, InitModule)
