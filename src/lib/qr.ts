import QRCode from "qrcode";

/**
 * Render a URL as an inline SVG QR code, never throwing. QR generation is used
 * inside server components (seller marketing kit, charge page, poster); an
 * unguarded rejection there would crash the whole page, so failures degrade to
 * an empty string and the surrounding UI still shows the copyable link.
 */
export async function qrSvg(
  text: string,
  color: { dark: string; light: string } = { dark: "#0e4d45", light: "#ffffff" },
): Promise<string> {
  try {
    return await QRCode.toString(text, { type: "svg", margin: 1, color });
  } catch (e) {
    console.error("qrSvg failed:", e);
    return "";
  }
}
