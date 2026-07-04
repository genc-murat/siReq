import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "src-tauri", "icons");
const SVG_PATH = join(ICONS_DIR, "logo.svg");

const sizes = [
  { name: "32x32.png", size: 32 },
  { name: "64x64.png", size: 64 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
  { name: "256x256.png", size: 256 },
  { name: "icon.png", size: 512 },
  { name: "Square30x30Logo.png", size: 30 },
  { name: "Square44x44Logo.png", size: 44 },
  { name: "Square71x71Logo.png", size: 71 },
  { name: "Square89x89Logo.png", size: 89 },
  { name: "Square107x107Logo.png", size: 107 },
  { name: "Square142x142Logo.png", size: 142 },
  { name: "Square150x150Logo.png", size: 150 },
  { name: "Square284x284Logo.png", size: 284 },
  { name: "Square310x310Logo.png", size: 310 },
  { name: "StoreLogo.png", size: 50 },
];

const svgBuffer = readFileSync(SVG_PATH);

async function generateIcons() {
  for (const { name, size } of sizes) {
    const outputPath = join(ICONS_DIR, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✅ ${name} (${size}x${size})`);
  }

  // Generate icon.ico (Windows) - create 256x256 PNG first, then we'll use it for .ico
  // For .ico, we can create a simple 32x32 version embedded in ICO format
  // Since sharp doesn't directly support .ico, we'll create a 32x32 PNG and note it
  const icon256Path = join(ICONS_DIR, "256x256.png");
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(icon256Path);
  console.log("✅ 256x256.png (for icon.ico source)");

  console.log("\n🎉 All icons generated successfully!");

  // Note about .ico and .icns
  console.log("\n📝 Notes:");
  console.log("- icon.ico: Use a tool like 'png2ico' or online converter to create from icon.png");
  console.log("- icon.icns: Use macOS 'iconutil' to create from icon.png");
}

generateIcons().catch(console.error);
