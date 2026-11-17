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
            "native/platform/mac/preview_mac.mm"
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
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/utf-8"],
              "ExceptionHandling": 1
            }
          },
          "libraries": ["d3d11.lib", "dxgi.lib", "d3dcompiler.lib", "user32.lib", "comctl32.lib", "oleacc.lib", "oleaut32.lib"],
          "sources": [
            "native/platform/win/renderer_win.cpp",
            "native/platform/win/embed_win.cpp",
            "native/platform/win/window_win.cpp",
            "native/platform/win/preview_win.cpp"
          ]
        }]
      ]
    }
  ]
}
