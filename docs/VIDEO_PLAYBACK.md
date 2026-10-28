# Automatic video playback copies and image controls

Every completed video upload enters a durable background queue automatically, even before a viewer opens it. Existing video attachments are discovered in bounded rowid batches after startup. The in-app viewer silently checks readiness and uses the private H.264/AAC copy when available. There is no Optimize video button or preparation notice. Native playback remains available while a copy waits. This workflow applies to uploaded video files; WebRTC camera and screen media uses the call engine.

## Host setup

Install a maintained FFmpeg build with the `libx264` video encoder and AAC audio encoder on the Node host. Use the platform packages/builds linked from [FFmpeg downloads](https://ffmpeg.org/download.html). FFmpeg is an external host dependency; Nexus does not bundle or download it. Without it, the website and native playback still start, the backlog remains stored and the host log explains the missing encoder. Restart Nexus after installing it or changing configuration.

For Debian/Ubuntu, the host package is `ffmpeg`. On Windows, the official download page links Gyan and BtbN builds. Extract a suitable build and add its bin directory to the Node service's PATH, or configure the full executable path:

```dotenv
VIDEO_COMPAT_ENABLED=true
# Omit FFMPEG_PATH when ffmpeg is already on the service PATH.
FFMPEG_PATH=C:\Tools\ffmpeg\bin\ffmpeg.exe
```

On Linux a full executable path can be `/usr/bin/ffmpeg`. `VIDEO_CACHE_PATH` optionally chooses a private writable cache directory; by default it is `video-playback` beside the upload directory. Keep it outside the public web root. The account running Node must be able to spawn FFmpeg and write the cache. Do not reset the database: schema 13 adds only the background-job table/index. Original uploads remain unchanged. New QuickTime/MP4 types are detected by signature; an old file previously classified as a generic document must be uploaded again to acquire the corrected video MIME type.

## Bounded work and restart recovery

All budgets live together in `server/config.js` under `playback`. Defaults are one encoder at a time, eight reserved/running jobs in memory, two threads per decoder/filter/encoder, a 250 ms gap between jobs, a fifteen-minute processing timeout, a 512 MiB output ceiling, a 2 GiB completed-copy cache and a 256 MiB free-space reserve. A row per source keeps the remaining backlog in SQLite. Duplicate requests do not create duplicate jobs. The host requests below-normal process priority where permitted. Run one Nexus service process for one database; the existing call/signaling architecture is also a single-process service.

Startup discovers existing files in pages of at most 32 once per second. New upload completion queues its file immediately. Reserved/running work is recovered after a stopped host. Failed encoding has at most three attempts, separated by one minute and then fifteen minutes. Disk-budget or free-space pressure pauses the whole worker for thirty seconds without spending codec retries. Deleting an attachment, message, server or account removes its job and cancels related work through the normal deletion paths. The backlog can take time to drain; hundreds of arrivals do not start hundreds of encoders.

Copies use H.264/AAC MP4, a maximum side of 1280 pixels, at most 30 FPS, a 2.5 Mbps video ceiling, an even-sized YUV420 picture and a fast-start index. Original upload limits remain unchanged; the smaller output ceiling applies only to playback copies. Long, damaged or unsupported sources can exceed these budgets. Their original is retained, processing attempts stop after the retry budget, and failures are logged on the host. These settings bound work rather than guaranteeing decoding of every possible source or reserving CPU/RAM on arbitrary hardware.

Input protocols/demuxers are restricted to local supported movie files; arguments never go through a shell. Partial files are unpublished, bounded outputs are checked and successful results are renamed atomically. Size-capped partial movies are rejected. Cache maintenance removes orphaned, stale and oldest copies. Evicted sources are not repeatedly converted by the historical scan: an authorized viewer can requeue an evicted source after a short cooldown. Source deletion invalidates related copies. Normal reading refreshes the copy's cache age.

## Access and viewer behavior

File status and byte-range serving retain the original session, membership, private-channel and block checks. Knowing a file ID or copy URL grants no access. Copies have no public static route and are not placed in a service-worker cache. Download actions still obtain the original under existing permissions.

The viewer only observes status; it never starts a client-side encode or requires a preparation click. Closing it or selecting another clip aborts the old request and rejects late responses. One bounded poll timer remains while waiting, with slower polling when hidden or the processor is unavailable. Source replacement preserves time and playing intent where browser autoplay rules permit it. Native controls, navigation and original download remain available. Only genuine playback failures can produce a diagnostic; background preparation has no UI message.

For images, the mouse wheel zooms around the cursor, high-resolution wheel events are combined per animation frame, and the primary mouse button pans an enlarged image within its bounds. Fit resets zoom/scroll; closing or navigating removes listeners, pointer capture and queued wheel work. Browser Ctrl/pinch zoom and native touch scrolling are preserved. Zoom and panning are never attached to video/audio controls.

Camera rotation does not use file conversion. Camera constraints keep sensor-primary orientation while allowing either frame orientation inside the maximum envelope. Rotation refreshes the current track, and decoded resize events update the displayed aspect without reopening the microphone or camera. Physical capture behavior still requires device testing.

Primary references: [FFmpeg format flags](https://www.ffmpeg.org/ffmpeg-formats.html), [protocol restrictions](https://www.ffmpeg.org/ffmpeg-protocols.html) and [capture constraints](https://www.w3.org/TR/mediacapture-streams/).
