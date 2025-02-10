#ifndef NO_DELAY_LOAD
// Include delay-load dependencies
#endif

// NOTE: Linter Warning - 'node_api.h' not found. Jika tidak terjadi error kompilasi, abaikan peringatan ini atau perbarui includePath (misal, di c_cpp_properties.json) untuk memasukkan direktori header Node.js.
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
#include <mutex>
#include <condition_variable>
#include <iostream>

class AudioMonitor : public Napi::ObjectWrap<AudioMonitor>
{
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports)
    {
        Napi::Function func = DefineClass(env, "AudioMonitor", {
                                                                   InstanceMethod("startMonitoring", &AudioMonitor::StartMonitoring),
                                                                   InstanceMethod("stopMonitoring", &AudioMonitor::StopMonitoring),
                                                               });

        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();
        exports.Set("AudioMonitor", func);
        return exports;
    }

    AudioMonitor(const Napi::CallbackInfo &info) : Napi::ObjectWrap<AudioMonitor>(info)
    {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    }

    ~AudioMonitor()
    {
        StopMonitoringInternal();
        CoUninitialize();
    }

private:
    static Napi::FunctionReference constructor;
    std::string targetProcess;
    std::atomic<bool> shouldStop{false};
    std::atomic<bool> tsfnValid{false};
    std::atomic<bool> callbackInProgress{false};
    std::unique_ptr<std::thread> monitorThread;
    Napi::ThreadSafeFunction tsfn;
    std::mutex tsfnMutex;
    std::condition_variable cv;

    Napi::Value StartMonitoring(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();

        if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction())
        {
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
            1);
        tsfnValid = true;

        shouldStop = false;
        monitorThread = std::make_unique<std::thread>([this]()
                                                      { MonitorAudioSessions(); });

        return env.Undefined();
    }

    Napi::Value StopMonitoring(const Napi::CallbackInfo &info)
    {
        StopMonitoringInternal();
        return info.Env().Undefined();
    }

    void StopMonitoringInternal()
    {
        shouldStop = true;
        {
            std::lock_guard<std::mutex> lock(tsfnMutex);
            tsfnValid = false;
        }
        cv.notify_all();
        // Wait for any ongoing TSFN callback to finish
        while (callbackInProgress.load())
        {
            std::cout << "AudioMonitor: Waiting for callbackInProgress to finish..." << std::endl;
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
        if (monitorThread && monitorThread->joinable())
        {
            monitorThread->join();
        }
        {
            std::lock_guard<std::mutex> lock(tsfnMutex);
            if (tsfn)
            {
                tsfn.Release();
                tsfn = Napi::ThreadSafeFunction();
            }
        }
    }

    void MonitorAudioSessions()
    {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);

        while (!shouldStop)
        {
            // Inisialisasi ulang pEnumerator dan defaultDevice pada setiap iterasi
            IMMDeviceEnumerator *pEnumerator = nullptr;
            HRESULT hr = CoCreateInstance(
                __uuidof(MMDeviceEnumerator),
                nullptr,
                CLSCTX_ALL,
                __uuidof(IMMDeviceEnumerator),
                (void **)&pEnumerator);
            if (FAILED(hr) || !pEnumerator)
            {
                {
                    std::unique_lock<std::mutex> lock(tsfnMutex);
                    cv.wait_for(lock, std::chrono::seconds(1), [this]()
                                { return shouldStop.load(); });
                }
                continue;
            }

            IMMDevice *defaultDevice = nullptr;
            hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &defaultDevice);
            if (FAILED(hr) || !defaultDevice)
            {
                pEnumerator->Release();
                {
                    std::unique_lock<std::mutex> lock(tsfnMutex);
                    cv.wait_for(lock, std::chrono::seconds(1), [this]()
                                { return shouldStop.load(); });
                }
                continue;
            }

            bool isActive = false;
            IAudioSessionManager2 *sessionManager = nullptr;
            hr = defaultDevice->Activate(
                __uuidof(IAudioSessionManager2),
                CLSCTX_ALL,
                nullptr,
                (void **)&sessionManager);
            if (FAILED(hr) || !sessionManager)
            {
                defaultDevice->Release();
                pEnumerator->Release();
                {
                    std::unique_lock<std::mutex> lock(tsfnMutex);
                    cv.wait_for(lock, std::chrono::seconds(1), [this]()
                                { return shouldStop.load(); });
                }
                continue;
            }

            IAudioSessionEnumerator *sessionEnumerator = nullptr;
            hr = sessionManager->GetSessionEnumerator(&sessionEnumerator);
            if (FAILED(hr))
            {
                sessionManager->Release();
                defaultDevice->Release();
                pEnumerator->Release();
                {
                    std::unique_lock<std::mutex> lock(tsfnMutex);
                    cv.wait_for(lock, std::chrono::seconds(1), [this]()
                                { return shouldStop.load(); });
                }
                continue;
            }

            int sessionCount = 0;
            hr = sessionEnumerator->GetCount(&sessionCount);
            if (FAILED(hr))
            {
                sessionEnumerator->Release();
                sessionManager->Release();
                defaultDevice->Release();
                pEnumerator->Release();
                {
                    std::unique_lock<std::mutex> lock(tsfnMutex);
                    cv.wait_for(lock, std::chrono::seconds(1), [this]()
                                { return shouldStop.load(); });
                }
                continue;
            }

            for (int i = 0; i < sessionCount; i++)
            {
                IAudioSessionControl *sessionControl = nullptr;
                hr = sessionEnumerator->GetSession(i, &sessionControl);
                if (FAILED(hr) || !sessionControl)
                {
                    continue;
                }

                IAudioSessionControl2 *sessionControl2 = nullptr;
                hr = sessionControl->QueryInterface(
                    __uuidof(IAudioSessionControl2),
                    (void **)&sessionControl2);
                if (SUCCEEDED(hr) && sessionControl2)
                {
                    DWORD processId = 0;
                    sessionControl2->GetProcessId(&processId);

                    if (processId)
                    {
                        HANDLE hProcess = OpenProcess(
                            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                            FALSE,
                            processId);
                        if (hProcess)
                        {
                            char processName[MAX_PATH];
                            if (GetModuleBaseNameA(hProcess, nullptr, processName, MAX_PATH))
                            {
                                if (std::string(processName).find(targetProcess) != std::string::npos)
                                {
                                    AudioSessionState state;
                                    if (SUCCEEDED(sessionControl->GetState(&state)) && state == AudioSessionStateActive)
                                    {
                                        isActive = true;
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
            sessionManager->Release();
            defaultDevice->Release();
            pEnumerator->Release();

            // Prepare to send status update via TSFN
            bool *isActivePtr = new bool(isActive);
            auto callback = [](Napi::Env env, Napi::Function jsCallback, bool *data)
            {
                jsCallback.Call({Napi::Boolean::New(env, *data)});
                delete data;
            };

            // Extra synchronization before calling TSFN.BlockingCall
            {
                {
                    std::lock_guard<std::mutex> lock(tsfnMutex);
                    if (!tsfnValid || shouldStop)
                    {
                        delete isActivePtr;
                        break;
                    }
                    // Mark that callback is in progress
                    callbackInProgress = true;
                    std::cout << "AudioMonitor: TSFN valid, calling BlockingCall" << std::endl;
                }
                try
                {
                    tsfn.BlockingCall(isActivePtr, callback);
                }
                catch (...)
                {
                    delete isActivePtr;
                }
                {
                    std::lock_guard<std::mutex> lock(tsfnMutex);
                    callbackInProgress = false;
                }
            }

            {
                std::unique_lock<std::mutex> lock(tsfnMutex);
                cv.wait_for(lock, std::chrono::seconds(1), [this]()
                            { return shouldStop.load(); });
            }
        }

        CoUninitialize();
    }
};

Napi::FunctionReference AudioMonitor::constructor;

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    return AudioMonitor::Init(env, exports);
}

NODE_API_MODULE(audio_monitor, Init)
