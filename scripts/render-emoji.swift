// 渲染 emoji 为 PNG（固定 2x 像素，脱离 Retina 依赖）。
// 用法: swift render-emoji.swift <emoji> <logicalSize> <outPath> [circle]
// circle=1 时绘制白底圆形标记图标；否则为透明底纯 emoji（用于 tabbar）。
import AppKit

let args = CommandLine.arguments
guard args.count >= 4 else {
    FileHandle.standardError.write("usage: render-emoji <emoji> <logicalSize> <out> [circle]\n".data(using: .utf8)!)
    exit(1)
}
let emoji = args[1]
let logical = Int(args[2]) ?? 72
let out = args[3]
let drawCircle = args.count >= 5 && args[4] == "1"
let scale = 2
let pixels = logical * scale

let str = NSAttributedString(
    string: emoji,
    attributes: [.font: NSFont.systemFont(ofSize: CGFloat(logical) * (drawCircle ? 0.54 : 0.85))]
)
let strSize = str.size()

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
) else { exit(1) }

NSGraphicsContext.saveGraphicsState()
guard let ctx = NSGraphicsContext(bitmapImageRep: rep) else { exit(1) }
NSGraphicsContext.current = ctx
ctx.cgContext.scaleBy(x: CGFloat(scale), y: CGFloat(scale))

if drawCircle {
    let inset: CGFloat = 1.5
    let circleRect = NSRect(
        x: inset, y: inset,
        width: CGFloat(logical) - inset * 2, height: CGFloat(logical) - inset * 2
    )
    let circle = NSBezierPath(ovalIn: circleRect)
    NSColor.white.setFill()
    circle.fill()
    NSColor(white: 0.92, alpha: 1).setStroke()
    circle.lineWidth = 1.5
    circle.stroke()
}

let textRect = NSRect(
    x: (CGFloat(logical) - strSize.width) / 2,
    y: (CGFloat(logical) - strSize.height) / 2 - CGFloat(logical) * 0.02,
    width: strSize.width,
    height: strSize.height
)
str.draw(in: textRect)
ctx.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: out))
print("done")
