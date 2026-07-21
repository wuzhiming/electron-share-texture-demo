{
  "targets": [
    {
      "target_name": "native_renderer",
      "sources": [
        "native/renderer_core.mm",
        "native/embed_view.mm",
        "native/preview_window.mm",
        "native/addon.mm"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "OTHER_CPLUSPLUSFLAGS": ["-ObjC++"],
            "OTHER_LDFLAGS": [
              "-framework Metal",
              "-framework MetalKit",
              "-framework IOSurface",
              "-framework Foundation",
              "-framework CoreGraphics",
              "-framework AppKit",
              "-framework QuartzCore"
            ]
          }
        }]
      ]
    }
  ]
}
