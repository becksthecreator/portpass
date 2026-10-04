import { describe, expect, it } from "vitest";
import { installGuide } from "./pwa";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const ANDROID_FIREFOX = "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0";
const WINDOWS_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("which home-screen steps a device gets", () => {
  it("gives iPhone Safari the Share steps, and other iPhone browsers a nudge to Safari", () => {
    expect(installGuide(IPHONE_SAFARI, "iPhone", 5)).toBe("ios-safari");
    expect(installGuide(IPHONE_CHROME, "iPhone", 5)).toBe("ios-other");
    // An iPad says it is a Mac, but has a touch screen.
    expect(installGuide(IPAD_AS_MAC, "MacIntel", 5)).toBe("ios-safari");
    expect(installGuide(IPAD_AS_MAC, "MacIntel", 0)).toBe("desktop");
  });

  it("gives Android its browser menu, and a computer a pointer to the phone", () => {
    expect(installGuide(ANDROID_CHROME, "Linux armv81", 5)).toBe("android");
    expect(installGuide(ANDROID_FIREFOX, "Linux armv81", 5)).toBe("android");
    expect(installGuide(WINDOWS_CHROME, "Win32", 0)).toBe("desktop");
  });
});
