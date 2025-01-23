#ifndef NO_DELAY_LOAD
// Include delay-load dependencies
#endif

#include <napi.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <functiondiscoverykeys_devpkey.h>
#include <windows.h>
#include <psapi.h>
#include <thread>
#include <atomic>
#include <string>

class AudioMonitor : public Napi::ObjectWrap<AudioMonitor> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "AudioMonitor", {
            InstanceMethod("startMonitoring", &AudioMonitor::StartMonitoring),
            InstanceMethod("stopMonitoring", &AudioMonitor::StopMonitoring),
        });

        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();
        exports.Set("AudioMonitor", func);
        return exports;
    }

    AudioMonitor(const Napi::CallbackInfo& info) : Napi::ObjectWrap<AudioMonitor>(info) {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    }

    ~AudioMonitor() {
        StopMonitoringInternal();
        CoUninitialize();
    }

private:
    static Napi::FunctionReference constructor;
    std::string targetProcess;
    std::atomic<bool> shouldStop{false};
    std::unique_ptr<std::thread> monitorThread;
    Napi::ThreadSafeFunction tsfn;

    Napi::Value StartMonitoring(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
            throw Napi::Error::New(env, "Expected process name (string) and callback function");
        }

        StopMonitoringInternal();

        targetProcess = info[0].As<Napi::String>().Utf8Value();
        Napi::Function callback = info[1].As<Napi::Function>();

        // Create thread-safe function
        tsfn = Napi::ThreadSafeFunction::New(
            env,
            callback,
            "AudioMonitorCallback",
            0,
            1
        );

        shouldStop = false;
        monitorThread = std::make_unique<std::thread>([this]() {
            MonitorAudioSessions();
        });

        return env.Undefined();
    }

    Napi::Value StopMonitoring(const Napi::CallbackInfo& info) {
        StopMonitoringInternal();
        return info.Env().Undefined();
    }

    void StopMonitoringInternal() {
        shouldStop = true;
        if (monitorThread && monitorThread->joinable()) {
            monitorThread->join();
        }
        if (tsfn) {
            tsfn.Release();
        }
    }

    void MonitorAudioSessions() {
        IMMDeviceEnumerator* pEnumerator = nullptr;
        HRESULT hr = CoCreateInstance(
            __uuidof(MMDeviceEnumerator),
            nullptr,
            CLSCTX_ALL,
            __uuidof(IMMDeviceEnumerator),
            (void**)&pEnumerator
        );

        if (FAILED(hr)) {
            return;
        }

        IMMDevice* defaultDevice = nullptr;
        hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &defaultDevice);
        if (FAILED(hr)) {
            pEnumerator->Release();
            return;
        }

        while (!shouldStop) {
            bool isActive = false;
            IAudioSessionManager2* sessionManager = nullptr;
            hr = defaultDevice->Activate(
                __uuidof(IAudioSessionManager2),
                CLSCTX_ALL,
                nullptr,
                (void**)&sessionManager
            );

            if (SUCCEEDED(hr)) {
                IAudioSessionEnumerator* sessionEnumerator = nullptr;
                hr = sessionManager->GetSessionEnumerator(&sessionEnumerator);

                if (SUCCEEDED(hr)) {
                    int sessionCount;
                    sessionEnumerator->GetCount(&sessionCount);

                    for (int i = 0; i < sessionCount; i++) {
                        IAudioSessionControl* sessionControl = nullptr;
                        sessionEnumerator->GetSession(i, &sessionControl);

                        IAudioSessionControl2* sessionControl2 = nullptr;
                        sessionControl->QueryInterface(
                            __uuidof(IAudioSessionControl2),
                            (void**)&sessionControl2
                        );

                        if (sessionControl2) {
                            DWORD processId = 0;
                            sessionControl2->GetProcessId(&processId);

                            if (processId) {
                                HANDLE hProcess = OpenProcess(
                                    PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                                    FALSE,
                                    processId
                                );

                                if (hProcess) {
                                    char processName[MAX_PATH];
                                    if (GetModuleBaseNameA(
                                        hProcess,
                                        nullptr,
                                        processName,
                                        MAX_PATH
                                    )) {
                                        if (std::string(processName).find(targetProcess) != std::string::npos) {
                                            AudioSessionState state;
                                            if (SUCCEEDED(sessionControl->GetState(&state))) {
                                                isActive = (state == AudioSessionStateActive);
                                            }
                                        }
                                    }
                                    CloseHandle(hProcess);
                                }
                            }
                            sessionControl2->Release();
                        }
                        sessionControl->Release();
                    }
                    sessionEnumerator->Release();
                }
                sessionManager->Release();
            }

            // Send status update through thread-safe function
            auto callback = [](Napi::Env env, Napi::Function jsCallback, bool* data) {
                jsCallback.Call({Napi::Boolean::New(env, *data)});
                delete data;
            };

            bool* isActivePtr = new bool(isActive);
            tsfn.BlockingCall(isActivePtr, callback);

            std::this_thread::sleep_for(std::chrono::seconds(1));
        }

        defaultDevice->Release();
        pEnumerator->Release();
    }
};

Napi::FunctionReference AudioMonitor::constructor;

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return AudioMonitor::Init(env, exports);
}

NODE_API_MODULE(audio_monitor, Init) 