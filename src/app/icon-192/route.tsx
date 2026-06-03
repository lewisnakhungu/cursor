import { ImageResponse } from "next/og";
import { logoIconMarkup } from "@/lib/brand/logo-icon-markup";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(logoIconMarkup(192), {
    width: 192,
    height: 192,
  });
}
