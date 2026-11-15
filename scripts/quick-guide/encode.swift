// The Quick guide's video, put together with macOS's own AVFoundation (no
// downloads, no packages): a folder of numbered PNG frames and one mono WAV
// voice-over become one MP4 with H.264 video and one mono AAC track, the
// index at the front ("faststart", so it plays while it loads).
//
//   swiftc -O encode.swift -o encode
//   ./encode <frames folder> <fps> <voice.wav> <out.mp4> <video bits per second> <audio bits per second>
//
// Built and run by scripts/make-quick-guide.mjs.
import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count == 7, let fps = Int32(args[2]), let vbr = Int(args[5]), let abr = Int(args[6]) else {
  FileHandle.standardError.write("usage: encode <frames> <fps> <voice.wav> <out.mp4> <video bps> <audio bps>\n".data(using: .utf8)!)
  exit(2)
}
let framesDir = URL(fileURLWithPath: args[1])
let voiceURL = URL(fileURLWithPath: args[3])
let outURL = URL(fileURLWithPath: args[4])

func fail(_ s: String) -> Never { FileHandle.standardError.write("\(s)\n".data(using: .utf8)!); exit(1) }

let frames = (try? FileManager.default.contentsOfDirectory(atPath: framesDir.path))?.filter { $0.hasSuffix(".png") }.sorted() ?? []
if frames.isEmpty { fail("No frames in \(framesDir.path)") }
func image(_ name: String) -> CGImage {
  guard let src = CGImageSourceCreateWithURL(framesDir.appendingPathComponent(name) as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("Can't read \(name)") }
  return img
}
let first = image(frames[0])
let width = first.width, height = first.height

try? FileManager.default.removeItem(at: outURL)
guard let writer = try? AVAssetWriter(outputURL: outURL, fileType: .mp4) else { fail("Can't write \(outURL.path)") }
writer.shouldOptimizeForNetworkUse = true // the index first: plays while it loads

let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoColorPropertiesKey: [
    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
  ],
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: vbr,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoH264EntropyModeKey: AVVideoH264EntropyModeCABAC,
    AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
    AVVideoAllowFrameReorderingKey: true,
    AVVideoExpectedSourceFrameRateKey: Int(fps),
  ],
])
video.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
])
var layout = AudioChannelLayout()
layout.mChannelLayoutTag = kAudioChannelLayoutTag_Mono
let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
  AVFormatIDKey: kAudioFormatMPEG4AAC,
  AVSampleRateKey: 48000,
  AVNumberOfChannelsKey: 1,
  AVEncoderBitRateKey: abr,
  AVEncoderAudioQualityKey: AVAudioQuality.max.rawValue,
  AVChannelLayoutKey: Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size),
])
audio.expectsMediaDataInRealTime = false
writer.add(video)
writer.add(audio)

// The voice: read as 32-bit float samples, mono, 48 kHz.
let voice = AVURLAsset(url: voiceURL)
let tracksSem = DispatchSemaphore(value: 0)
var voiceTrack: AVAssetTrack?
voice.loadTracks(withMediaType: .audio) { t, _ in voiceTrack = t?.first; tracksSem.signal() }
tracksSem.wait()
guard let vt = voiceTrack, let reader = try? AVAssetReader(asset: voice) else { fail("Can't read \(voiceURL.path)") }
let readOut = AVAssetReaderTrackOutput(track: vt, outputSettings: [
  AVFormatIDKey: kAudioFormatLinearPCM,
  AVLinearPCMBitDepthKey: 32,
  AVLinearPCMIsFloatKey: true,
  AVLinearPCMIsBigEndianKey: false,
  AVLinearPCMIsNonInterleaved: false,
  AVSampleRateKey: 48000,
  AVNumberOfChannelsKey: 1,
])
reader.add(readOut)
if !reader.startReading() { fail("Can't start reading the voice") }

if !writer.startWriting() { fail("Can't start writing: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)

let group = DispatchGroup()
let vq = DispatchQueue(label: "video"), aq = DispatchQueue(label: "audio")
var index = 0
group.enter()
video.requestMediaDataWhenReady(on: vq) {
  while video.isReadyForMoreMediaData {
    if index >= frames.count { video.markAsFinished(); group.leave(); return }
    let img = index == 0 ? first : image(frames[index])
    guard let pool = adaptor.pixelBufferPool else { fail("No pixel buffer pool") }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
    guard let buf = pb else { fail("No pixel buffer") }
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: width, height: height, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(buf, [])
    if !adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: fps)) { fail("Frame \(index): \(String(describing: writer.error))") }
    index += 1
  }
}
group.enter()
audio.requestMediaDataWhenReady(on: aq) {
  while audio.isReadyForMoreMediaData {
    if let sb = readOut.copyNextSampleBuffer() {
      if !audio.append(sb) { fail("Audio: \(String(describing: writer.error))") }
    } else { audio.markAsFinished(); group.leave(); return }
  }
}
group.wait()
// The video ends with its last frame's time.
writer.endSession(atSourceTime: CMTime(value: CMTimeValue(frames.count), timescale: fps))
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fail("Not written: \(String(describing: writer.error))") }
print("Wrote \(outURL.path): \(frames.count) frames at \(fps) fps, \(width) by \(height)")
