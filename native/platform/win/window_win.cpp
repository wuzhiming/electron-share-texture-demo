#include "win_renderer.h"
#include <commctrl.h>
#include <oleacc.h>
#include <algorithm>
#include <stdexcept>
#include <vector>

static HWND s_hostWindow = nullptr;
static RECT s_menuBlank = {};
static constexpr UINT_PTR kMenuDragSubclass = 1;

// Electron draws the top menu with Chromium Views, not a Win32 HMENU.
// Its accessibility tree supplies the actual button bounds, including font,
// localization and DPI, so no hard-coded menu width or pixel sampling is needed.
static ComPtr<IAccessible> FindMenuBar(IAccessible* node, int depth = 0) {
    if (depth > 16) return nullptr;
    VARIANT self = {};
    self.vt = VT_I4;
    self.lVal = CHILDID_SELF;
    VARIANT role = {};
    HRESULT result = node->get_accRole(self, &role);
    const bool isMenuBar = SUCCEEDED(result) && role.vt == VT_I4 && role.lVal == ROLE_SYSTEM_MENUBAR;
    VariantClear(&role);
    if (isMenuBar) return ComPtr<IAccessible>(node);

    long count = 0;
    if (FAILED(node->get_accChildCount(&count)) || count <= 0) return nullptr;
    count = std::min(count, 64L);
    std::vector<VARIANT> children(count);
    long obtained = 0;
    ComPtr<IAccessible> found;
    if (SUCCEEDED(AccessibleChildren(node, 0, count, children.data(), &obtained))) {
        for (long i = 0; i < obtained && !found; ++i) {
            ComPtr<IDispatch> dispatch;
            if (children[i].vt == VT_DISPATCH) dispatch = children[i].pdispVal;
            else if (children[i].vt == VT_I4) node->get_accChild(children[i], &dispatch);
            ComPtr<IAccessible> child;
            if (dispatch && SUCCEEDED(dispatch.As(&child))) found = FindMenuBar(child.Get(), depth + 1);
        }
    }
    for (auto& child : children) VariantClear(&child);
    return found;
}

static LRESULT CALLBACK MenuDragProc(HWND window, UINT message, WPARAM wParam,
    LPARAM lParam, UINT_PTR id, DWORD_PTR) {
    if (message == WM_NCDESTROY) {
        RemoveWindowSubclass(window, MenuDragProc, id);
        s_hostWindow = nullptr;
        s_menuBlank = {};
    } else if (message == WM_NCHITTEST && !IsRectEmpty(&s_menuBlank)) {
        POINT point = {GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
        if (ScreenToClient(window, &point) && PtInRect(&s_menuBlank, point)) {
            // Preserve system resize handles and caption controls at the edges.
            LRESULT original = DefSubclassProc(window, message, wParam, lParam);
            if (original >= HTLEFT && original <= HTBOTTOMRIGHT) return original;
            return HTCAPTION;
        }
    } else if (message == WM_NCLBUTTONDOWN && wParam == HTCAPTION) {
        POINT point = {GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
        if (ScreenToClient(window, &point) && PtInRect(&s_menuBlank, point)) {
            // Chromium's transparent framed-window handler does not start a
            // caption move. Dispatch this caption click to Windows directly.
            ReleaseCapture();
            return DefWindowProcW(window, message, wParam, lParam);
        }
    }
    return DefSubclassProc(window, message, wParam, lParam);
}

WindowDragRegion PlatformConfigureMenuBarDrag(void* windowHandle) {
    HWND window = *static_cast<HWND*>(windowHandle);
    if (!IsWindow(window)) throw std::runtime_error("Invalid Electron HWND");
    ComPtr<IAccessible> root;
    WinCheck(AccessibleObjectFromWindow(window, OBJID_CLIENT, IID_PPV_ARGS(&root)), "Get native window accessibility");
    auto menu = FindMenuBar(root.Get());
    RECT blank = {};
    if (menu) {
        VARIANT self = {};
        self.vt = VT_I4;
        self.lVal = CHILDID_SELF;
        long x, y, width, height;
        WinCheck(menu->accLocation(&x, &y, &width, &height, self), "Get menu bar bounds");
        blank = {x, y, x + width, y + height};
        long count = 0;
        WinCheck(menu->get_accChildCount(&count), "Get menu buttons");
        for (long i = 1; i <= count; ++i) {
            VARIANT child = {};
            child.vt = VT_I4;
            child.lVal = i;
            long cx, cy, cw, ch;
            if (SUCCEEDED(menu->accLocation(&cx, &cy, &cw, &ch, child)) && cw > 0 && ch > 0) {
                blank.left = std::max(blank.left, cx + cw);
            }
        }
        MapWindowPoints(nullptr, window, reinterpret_cast<POINT*>(&blank), 2);
        RECT client;
        GetClientRect(window, &client);
        RECT clipped;
        if (IntersectRect(&clipped, &blank, &client)) blank = clipped;
        else blank = {};
    }
    if (s_hostWindow != window) {
        PlatformRemoveMenuBarDrag();
        if (!SetWindowSubclass(window, MenuDragProc, kMenuDragSubclass, 0)) {
            throw std::runtime_error("Install native menu drag handler failed");
        }
        s_hostWindow = window;
    }
    s_menuBlank = blank;
    if (!IsRectEmpty(&blank)) {
        POINT point = {(blank.left + blank.right) / 2, (blank.top + blank.bottom) / 2};
        ClientToScreen(window, &point);
        if (SendMessageW(window, WM_NCHITTEST, 0, MAKELPARAM(point.x, point.y)) != HTCAPTION) {
            throw std::runtime_error("Native menu blank area did not become draggable");
        }
    }
    return {blank.left, blank.top, std::max(0L, blank.right - blank.left), std::max(0L, blank.bottom - blank.top)};
}

void PlatformRemoveMenuBarDrag() {
    if (IsWindow(s_hostWindow)) RemoveWindowSubclass(s_hostWindow, MenuDragProc, kMenuDragSubclass);
    s_hostWindow = nullptr;
    s_menuBlank = {};
}

void PlatformBeginWindowDrag(void* windowHandle) {
    HWND window = *static_cast<HWND*>(windowHandle);
    if (!IsWindow(window)) throw std::runtime_error("Invalid Electron HWND");
    POINT cursor;
    if (!GetCursorPos(&cursor)) throw std::runtime_error("Get window drag cursor failed");
    ReleaseCapture();
    DefWindowProcW(window, WM_NCLBUTTONDOWN, HTCAPTION, MAKELPARAM(cursor.x, cursor.y));
}
