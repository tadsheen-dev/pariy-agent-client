{
  "targets": [{
    "target_name": "audio_monitor",
    "cflags!": [ "-fno-exceptions" ],
    "cflags_cc!": [ "-fno-exceptions" ],
    "sources": [ "native/audio_monitor.cpp" ],
    "defines": [ "NO_DELAY_LOAD" ],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")"
    ],
    "libraries": [
      "ole32.lib",
      "oleaut32.lib",
      "winmm.lib",
      "psapi.lib"
    ],
    "msvs_settings": {
      "VCCLCompilerTool": {
        "ExceptionHandling": 1
      },
      "VCLinkerTool": {
        "AdditionalLibraryDirectories": [
          "C:/Program Files (x86)/Windows Kits/10/Lib/10.0.22000.0/um/x64",
          "C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/14.38.33130/lib/x64"
        ]
      }
    },
    "defines": [
      "NAPI_CPP_EXCEPTIONS",
      "WIN32_LEAN_AND_MEAN"
    ],
    "conditions": [
      ["OS=='win'", {
        "defines": [
          "_HAS_EXCEPTIONS=1"
        ]
      }]
    ]
  }]
}