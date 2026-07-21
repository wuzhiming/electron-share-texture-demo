{
  "targets": [
    {
      "target_name": "native_renderer",
      "sources": ["native/addon.cc"],
      "include_dirs": [
        "native",
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='mac'", {
          "sources": [
            "native/platform/mac/renderer_mac.mm",
            "native/platform/mac/embed_mac.mm",
            "native/platform/mac/preview_mac.mm",
            "native/platform/mac/overlay_mac.mm"
          ],
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
        }],
        ["OS=='win'", {
          "sources": [
            "native/platform/win/renderer_win.cpp",
            "native/platform/win/embed_win.cpp",
            "native/platform/win/preview_win.cpp",
            "native/platform/win/overlay_win.cpp"
          ]
        }]
      ]
    }
  ]
}
