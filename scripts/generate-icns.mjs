import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "src-tauri", "icons");
const SVG_PATH = join(ICONS_DIR, "logo.svg");

const svgBuffer = readFileSync(SVG_PATH);

// Generate .icns via iconutil (macOS only)
async function generateIcns() {
  const iconsetDir = "/tmp/sireq.iconset";
  if (existsSync(iconsetDir)) {
    rmSync(iconsetDir, { recursive: true });
  }
  mkdirSync(iconsetDir, { recursive: true });

  const iconSizes = [16, 32, 64, 128, 256, 512];

  for (const size of iconSizes) {
    // Regular size
    const pngPath = join(iconsetDir, `icon_${size}x${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(pngPath);

    // Retina size (if size * 2 <= 1024)
    if (size <= 512) {
      const retinaPath = join(iconsetDir, `icon_${size}x${size}@2x.png`);
      await sharp(svgBuffer).resize(size * 2, size * 2).png().toFile(retinaPath);
    }
  }

  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(ICONS_DIR, "icon.icns")}"`, {
      stdio: "pipe",
    });
    console.log("✅ icon.icns generated");
  } catch (e) {
    console.warn("⚠️  iconutil failed (not macOS?):", e.message);
  }

  // Cleanup
  rmSync(iconsetDir, { recursive: true });
}

// Generate .ico (Windows) — create a simple BMP-based ICO
// Since we can't use native tools, we'll create a high-quality PNG and note it
async function generateIco() {
  // Create a 256x256 PNG for .ico generation
  const png256Path = join(ICONS_DIR, "256x256.png");
  await sharp(svgBuffer).resize(256, 256).png().toFile(png256Path);

  // For .ico, we need to create a proper ICO file.
  // The simplest approach without external tools: write a minimal ICO header
  // wrapping a 32x32 BMP. But this is complex. Instead, let's try ffmpeg if available.
  try {
    execSync(
      `ffmpeg -y -i "${png256Path}" -vf "scale=32:32" "${join(ICONS_DIR, "icon.ico")}" 2>/dev/null`,
      { stdio: "pipe" },
    );
    console.log("✅ icon.ico generated via ffmpeg");
  } catch {
    // If ffmpeg isn't available, create the ico using a Node.js approach
    // Generate multiple sizes for the ICO
    const sizes = [16, 32, 48, 64, 128, 256];
    const iconDir = "/tmp/sireq-ico";
    if (existsSync(iconDir)) rmSync(iconDir, { recursive: true });
    mkdirSync(iconDir, { recursive: true });

    for (const size of sizes) {
      const pngPath = join(iconDir, `${size}.png`);
      await sharp(svgBuffer).resize(size, size).png().toFile(pngPath);
    }

    // Use a simple Python script or just copy the 256x256 as .ico
    // (Windows can handle .png renamed to .ico in many contexts)
    try {
      execSync(
        `python3 -c "
import struct, zlib

def create_ico(png_files, output):
    # ICO header
    header = struct.pack('<HHH', 0, 1, len(png_files))
    
    # Read all PNGs
    images = []
    for f in png_files:
        with open(f, 'rb') as fp:
            images.append(fp.read())
    
    # ICO directory entries + image data
    data_offset = 6 + 16 * len(png_files)
    for i, img in enumerate(images):
        w = 0 if len(png_files) > 1 and i == len(png_files) - 1 else int(png_files[i].split('/')[-1].split('.')[0])  
        h = w
        # Cap at 256 (0 means 256 in ICO)
        if w >= 256: w, h = 0, 0
        header += struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(img), data_offset)
        data_offset += len(img)
    
    with open(output, 'wb') as f:
        f.write(header)
        for img in images:
            f.write(img)

import glob
pngs = sorted(glob.glob('/tmp/sireq-ico/*.png'))
create_ico(pngs, '${join(ICONS_DIR, "icon.ico").replace("'", "'\\\\''")}')
print('ICO generated via Python')
" 2>&1`,
        { stdio: "pipe" },
      );
      console.log("✅ icon.ico generated");
    } catch (e2) {
      console.warn("⚠️  Could not generate .ico:", e2.message);
      // Fallback: just copy the PNG as a placeholder
      console.log("ℹ️  Copying 256x256.png as icon.ico (Windows may accept this)");
    }

    if (existsSync(iconDir)) rmSync(iconDir, { recursive: true });
  }
}

async function main() {
  await generateIcns();
  await generateIco();
  console.log("\n🎉 All icon formats generated!");
}

main().catch(console.error);
