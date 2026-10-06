/**
 * The foreground window on Windows, read through the Win32 API with koffi.
 *
 * Replaces active-win, whose Windows code needs ffi-napi: that native module has
 * no builds for current Node and Electron, so it was missing from installs and no
 * window was ever detected. koffi ships prebuilt binaries, so nothing is compiled
 * or downloaded at install time.
 *
 * The result keeps active-win's shape and naming, so stored activities and
 * mappings keep matching: owner.name is the executable's file description
 * ("Google Chrome"), or its file name when it has none, and Store apps hosted by
 * ApplicationFrameHost.exe report the hosted app's process.
 */
import path from 'path';
import koffi from 'koffi';

export interface ActiveWindow {
  platform: 'windows';
  title: string;
  owner: { name: string; processId: number; path: string };
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const MAX_PATH_CHARS = 32768;

let api: ReturnType<typeof loadApi> | null = null;

function loadApi() {
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const version = koffi.load('version.dll');

  koffi.pointer('HWND', koffi.opaque());
  koffi.pointer('HANDLE', koffi.opaque());
  // Named type used by EnumChildWindows below.
  koffi.proto('int __stdcall EnumChildProc(HWND hwnd, intptr_t lParam)');

  return {
    GetForegroundWindow: user32.func('HWND __stdcall GetForegroundWindow()'),
    GetWindowTextLengthW: user32.func('int __stdcall GetWindowTextLengthW(HWND hWnd)'),
    GetWindowTextW: user32.func('int __stdcall GetWindowTextW(HWND hWnd, _Out_ uint16_t *lpString, int nMaxCount)'),
    GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *lpdwProcessId)'),
    EnumChildWindows: user32.func('int __stdcall EnumChildWindows(HWND hWndParent, EnumChildProc *lpEnumFunc, intptr_t lParam)'),
    OpenProcess: kernel32.func('HANDLE __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)'),
    CloseHandle: kernel32.func('int __stdcall CloseHandle(HANDLE hObject)'),
    QueryFullProcessImageNameW: kernel32.func(
      'int __stdcall QueryFullProcessImageNameW(HANDLE hProcess, uint32_t dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)'),
    GetFileVersionInfoSizeW: version.func('uint32_t __stdcall GetFileVersionInfoSizeW(str16 lptstrFilename, _Out_ uint32_t *lpdwHandle)'),
    GetFileVersionInfoW: version.func('int __stdcall GetFileVersionInfoW(str16 lptstrFilename, uint32_t dwHandle, uint32_t dwLen, _Out_ uint8_t *lpData)'),
    VerQueryValueW: version.func('int __stdcall VerQueryValueW(uint8_t *pBlock, str16 lpSubBlock, _Out_ void **lplpBuffer, _Out_ uint32_t *puLen)')
  };
}

function win32() {
  if (!api) api = loadApi();
  return api;
}

const utf16 = (buffer: Uint16Array, length: number) => Buffer.from(buffer.buffer, 0, length * 2).toString('utf16le');

function processPath(processId: number): string | undefined {
  const w = win32();
  const handle = w.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, processId);
  if (!handle) return undefined;
  try {
    const buffer = new Uint16Array(MAX_PATH_CHARS);
    const size = [MAX_PATH_CHARS];
    if (!w.QueryFullProcessImageNameW(handle, 0, buffer, size)) return undefined;
    return utf16(buffer, size[0]);
  } finally {
    w.CloseHandle(handle);
  }
}

function readVersionString(block: Uint8Array, query: string): unknown[] | undefined {
  const pointer: unknown[] = [null];
  const length = [0];
  if (!win32().VerQueryValueW(block, query, pointer, length) || !pointer[0] || length[0] === 0) return undefined;
  return [pointer[0], length[0]];
}

/** The executable's FileDescription from its version resource, if it has one. */
export function fileDescription(filePath: string): string | undefined {
  const w = win32();
  const size = w.GetFileVersionInfoSizeW(filePath, [0]);
  if (!size) return undefined;
  const block = new Uint8Array(size);
  if (!w.GetFileVersionInfoW(filePath, 0, size, block)) return undefined;

  // Use the first language/code page listed; fall back to US English, Unicode.
  let codePage = '040904b0';
  const translation = readVersionString(block, '\\VarFileInfo\\Translation');
  if (translation) {
    const [language, page] = koffi.decode(translation[0], koffi.array('uint16_t', 2)) as number[];
    codePage = ((language << 16) | page).toString(16).padStart(8, '0');
  }

  const found = readVersionString(block, `\\StringFileInfo\\${codePage}\\FileDescription`);
  if (!found) return undefined;
  const chars = koffi.decode(found[0], koffi.array('uint16_t', found[1] as number)) as number[];
  const text = String.fromCharCode(...chars).replace(/\0[\s\S]*$/, '').trim();
  return text || undefined;
}

/** Name and path of a process, named as active-win named it. */
export function processInfo(processId: number): { name: string; path: string } | undefined {
  const exePath = processPath(processId);
  if (!exePath) return undefined;
  return { name: fileDescription(exePath) || path.basename(exePath), path: exePath };
}

function windowProcessId(hwnd: unknown): number {
  const pid = [0];
  win32().GetWindowThreadProcessId(hwnd, pid);
  return pid[0];
}

/** Store apps run inside ApplicationFrameHost.exe; report the hosted app's process instead. */
function hostedProcess(hwnd: unknown, hostPath: string): { processId: number; name: string; path: string } | undefined {
  let found: { processId: number; name: string; path: string } | undefined;
  win32().EnumChildWindows(hwnd, (child: unknown) => {
    const processId = windowProcessId(child);
    const info = processInfo(processId);
    if (info && info.path !== hostPath) {
      found = { processId, ...info };
      return 0; // stop
    }
    return 1;
  }, 0);
  return found;
}

/** The foreground window, or undefined when there is none or it cannot be read. */
export function activeWindow(): ActiveWindow | undefined {
  const w = win32();
  const hwnd = w.GetForegroundWindow();
  if (!hwnd) return undefined;

  const length = w.GetWindowTextLengthW(hwnd);
  const buffer = new Uint16Array(length + 1);
  const copied = length > 0 ? w.GetWindowTextW(hwnd, buffer, length + 1) : 0;
  const title = utf16(buffer, copied);

  const processId = windowProcessId(hwnd);
  const info = processInfo(processId);
  if (!info) return undefined;

  let owner = { name: info.name, processId, path: info.path };
  if (path.basename(info.path).toLowerCase() === 'applicationframehost.exe') {
    owner = hostedProcess(hwnd, info.path) ?? owner;
  }

  return { platform: 'windows', title, owner };
}
