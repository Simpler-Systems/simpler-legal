// The window's icon at the size the display asks for (Windows only).
//
// Tauri builds the window icon from the FIRST frame of icon.ico (tauri-codegen 2.6.3,
// src/image.rs: `icon_dir.entries()[0]`), and that frame is the 16px one. tao then hands that one
// image to Windows as both ICON_SMALL and ICON_BIG, so the taskbar stretched 16px to 36px at 150%
// scaling. The 2026-09-12 icon fix repaired every frame of icon.ico, but none of them past the
// first ever reached the running window: the blurry taskbar button on 2026-09-25 was that.
//
// The fix loads the icon out of this exe's own resources (tauri-build embeds icon.ico as resource
// 32512, tauri-build 2.6.3 src/lib.rs) at the two sizes the window's DPI asks for (SM_CXICON for
// ICON_BIG, SM_CXSMICON for ICON_SMALL), so Windows picks the matching drawn frame and does not
// resample. main.rs calls it once the window exists and again whenever its scale factor changes.
// If anything here fails, the window keeps Tauri's icon: a blurry icon is a cosmetic fault, not a
// reason to stop the app, so the failure is written to stderr and the app goes on.

use std::ffi::c_void;
use std::sync::Mutex;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, LoadImageW, SendMessageW, HICON, ICON_BIG, ICON_SMALL, IMAGE_ICON,
    LR_DEFAULTCOLOR, SM_CXICON, SM_CXSMICON, SYSTEM_METRICS_INDEX, WM_SETICON,
};

// tauri-build's resource id for icon.ico (IDI_APPLICATION's value, which Windows also uses for
// the exe's own icon in Explorer).
const ICON_RESOURCE: usize = 32512;

// The icons this module set last, as raw handle values ([small, big]; 0 = none). Only these are
// ever destroyed, and only after they have been replaced: an icon still set on a window must
// outlive it, and the one tao set belongs to tao.
static OURS: Mutex<[usize; 2]> = Mutex::new([0, 0]);

/// Sets the window's small and big icons from the exe's icon resource at the sizes its current
/// DPI asks for. `hwnd` is the raw handle (`window.hwnd()?.0`).
pub fn apply(hwnd: *mut c_void) {
    if let Err(e) = try_apply(HWND(hwnd)) {
        eprintln!("window icon: kept the default icon ({e})");
    }
}

fn try_apply(hwnd: HWND) -> Result<(), String> {
    let dpi = unsafe { GetDpiForWindow(hwnd) };
    if dpi == 0 {
        return Err("GetDpiForWindow returned 0 (not a window)".into());
    }
    let module = unsafe { GetModuleHandleW(PCWSTR::null()) }
        .map_err(|e| format!("GetModuleHandleW: {e}"))?;
    let load = |metric: SYSTEM_METRICS_INDEX| -> Result<HICON, String> {
        let px = unsafe { GetSystemMetricsForDpi(metric, dpi) };
        if px <= 0 {
            return Err(format!("GetSystemMetricsForDpi({}, {dpi}) = {px}", metric.0));
        }
        // MAKEINTRESOURCE: an integer resource id passed where a name would go
        let h = unsafe {
            LoadImageW(
                HINSTANCE(module.0),
                PCWSTR(ICON_RESOURCE as *const u16),
                IMAGE_ICON,
                px,
                px,
                LR_DEFAULTCOLOR,
            )
        }
        .map_err(|e| format!("LoadImageW({ICON_RESOURCE}, {px}px): {e}"))?;
        Ok(HICON(h.0))
    };
    let small = load(SM_CXSMICON)?;
    let big = match load(SM_CXICON) {
        Ok(b) => b,
        Err(e) => {
            unsafe { DestroyIcon(small) }.ok();
            return Err(e);
        }
    };

    let mut ours = OURS.lock().unwrap_or_else(|p| p.into_inner());
    for (slot, kind, icon) in [(0, ICON_SMALL, small), (1, ICON_BIG, big)] {
        let previous = unsafe {
            SendMessageW(hwnd, WM_SETICON, WPARAM(kind as usize), LPARAM(icon.0 as isize))
        };
        if ours[slot] != 0 && previous.0 as usize == ours[slot] {
            unsafe { DestroyIcon(HICON(previous.0 as *mut c_void)) }.ok();
        }
        ours[slot] = icon.0 as usize;
    }
    Ok(())
}
