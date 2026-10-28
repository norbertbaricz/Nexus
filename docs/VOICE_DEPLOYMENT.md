# Voice, camera and screen deployment

The application implements authenticated WebRTC signaling, separate microphone/camera/screen tracks with offered-m-line adoption on the answering peer, offer-collision handling, queued early ICE, bounded connection recovery persistent media elements, explicit camera/screen MID metadata and later renegotiation handling. A joined room is distinct from an established media connection.

## Device selection and streaming quality

Use the attached arrows on microphone, deafen, camera and screen controls, or open Settings → Voice & video. Opening an input chooser or selecting an input requests browser access automatically when device names are not available. There is no separate Allow button; the browser/operating system still requires the user's consent. Temporary discovery tracks are stopped after enumeration. Selecting an input uses its exact device ID; an unavailable device produces a useful error instead of silently choosing a different microphone or camera. Current and future peer audio uses the selected speaker when setSinkId is supported. Browser permission may be required through selectAudioOutput. Otherwise Nexus explains that output is controlled by system sound settings. The speaker test uses the selected output; general notification sounds retain their system output.

Device choices, input processing and quality stay local for each account/browser. They do not sync to another computer's hardware. Opening Settings only enumerates devices; using an input chooser can briefly capture that input to reveal its names. Joining a call starts microphone capture, and turning the camera on starts video capture. Active input switches retain the old track until sender replacement succeeds, preserve mute/deafen/stage restrictions and keep screen sharing independent. Failed changes preserve the working input. Disconnecting hardware prompts the user to choose a connected input.

Camera defaults to a 1080p/30 FPS capture target and a 6 Mbps automatic sender ceiling; screen sharing defaults to 1080p/60 FPS with a 12 Mbps ceiling. Both offer 480p, 720p, 1080p, 1440p and 4K; frame rates are 15, 24, 30 and 60. Manual video bitrate ceilings are 4, 8, 12, 20 and 40 Mbps. Microphone sender audio is capped at 128 kbps. These are upper limits/preferences, not reserved bandwidth. Actual capture dimensions/FPS are shown separately; actual encoded throughput can be lower. Every remote peer adds mesh upload traffic.

Live quality changes apply constraints to existing tracks and update negotiated sender parameters. A failed constraint change restores the previous constraints. Screen constraints scale the user's selected surface, never bypass its permission chooser. Sharing starts from a deliberate click, as required by browsers.

Output, capture and sender API support is detected at runtime. Physical microphone/camera changes, Bluetooth routes and WebRTC delivery still require deployment testing on the intended browsers/devices.

## Per-person listening volume

Right-click a participant's tile, avatar or member row, use Shift+F10 on it, or use the tile's member-options button. Touch devices also support the options button and a long press. When you share an active call, the menu exposes 0–200% volume, Mute for me and Reset. The same user keeps their setting after reconnection, even if their socket ID changes. Changes affect only your listening audio and stay local to your account/device.

Non-default levels use an independent Web Audio gain and generated MediaStream for each peer. The generated stream still plays through the existing HTML audio element and selected speaker; no gain node connects directly to physical output. Deafen, blocks, stage/server restrictions and unavailable output routes silence that element immediately. Disconnecting removes generated graphs/tracks without stopping the original received tracks. Browsers without Web Audio expose reductions through their native volume control, up to 100%.

A suspended audio context requires the existing Enable call audio action. Amplification can make a quiet signal louder, but cannot repair clipped or distorted microphone input.

## Required hosting configuration

1. Serve the Node application over HTTPS with WebSocket upgrades and persistent storage. Localhost is suitable for development. A plain HTTP address on another device generally cannot capture microphone or camera media.
2. Configure the external service origin and HTTPS cookies in your private environment settings. Trust proxy headers only behind a reverse proxy you control.
3. Obtain a real TURN relay from your hosting or relay provider. An HTTPS application tunnel or a WebSocket endpoint is not itself a TURN relay.
4. Fill `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL` in `.env` with the actual endpoints and issued credentials. `TURN_URLS` accepts comma-separated `turn:` or `turns:` endpoints. Endpoint transport and ports must match the provider configuration. For coturn REST authentication, configure TURN_SHARED_SECRET to match static-auth-secret instead of static TURN_USERNAME/TURN_CREDENTIAL; Nexus issues one-hour HMAC credentials to signed-in users and never exposes the secret.
5. Alternatively, supply the provider's complete RTCIceServer array in `ICE_SERVERS`. The authenticated client receives its media configuration from `/api/config`. Never use an administrative account password as a relay credential.
6. Restart the application and reload the clients after changing configuration.

Leaving the TURN settings empty retains STUN-only development behavior. STUN cannot provide a relay when a direct peer path is unavailable. The project does not provision an external relay or invent working credentials.

## Speaking feedback

A local-only Web Audio analyser measures input energy from your live microphone and received peer audio. Speaking tiles use a green outline and animated bars. Mute, deafening, stage permissions, blocks and leaving stop the corresponding indicators. This does not send audio samples or speaking telemetry to the server. Enable call audio if the browser suspends playback/analysis. A local speaking indicator proves local input energy; it does not prove another device received the stream.

## Device checks

Use two physical devices connected to different networks for the deployment check. Confirm audio in both directions, then camera video in both directions. Start screen sharing while the camera remains on; the shared screen should become the main presentation and the camera should remain in the thumbnail rail. Expand the shared screen to inspect text at a larger size.

If the browser blocks audio autoplay, use **Enable call audio** after joining. Confirm the tab is not muted and that the intended output device is selected. Microphone and camera permission are controlled by the browser and operating system.

Screen capture availability varies by browser and operating system. Unsupported browsers display a clear capture message and can still receive a remote shared screen when their WebRTC connection works. Browser-native fullscreen is used when available; an expanded viewport view remains available when native fullscreen is unavailable.

## Interpreting connection failures

- A working account, live text chat or a room participant list proves HTTP/signaling connectivity, not audio/video transport.
- A local camera or screen preview proves local capture and rendering, not delivery to another device.
- No ICE candidates or no inbound media requires checking the actual network and relay configuration. The client reports a bounded connection failure instead of marking media as connected.
- A network change can trigger bounded ICE recovery. If signaling is lost, the previous call reconnects with fresh microphone/camera tracks after the connection returns. Browser screen capture must be started again with a user gesture.

The current architecture is an eight-participant mesh. Larger voice rooms need an SFU and dedicated media infrastructure.

## Verification boundary for this archive

The 2.9 regression test models the native rule that an answerer’s pre-created addTransceiver slots are not reused by an offer. It verifies that actual offered slots carry the microphone, camera and screen, while unused slots are stopped. Automated tests also cover independent camera/screen senders, early signaling, offer collisions, capture cancellation, permission revocation and bounded ICE recovery. Browser QA verified simultaneous local camera/screen rendering, a large presentation stage and unchanged video mount count while toggling mute, using synthetic test media.

In the 2.9 native browser check, both peers reached stable signaling, but the QA browser still gathered zero ICE candidates and received zero inbound media bytes/decoded frames. Remote audio/video across two physical devices is therefore not marked as passed. It requires the chosen HTTPS deployment, actual relay credentials and real device validation.

Primary references:

- https://webrtc.org/getting-started/turn-server
- https://webrtc.org/getting-started/peer-connections
- https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation

For relay diagnostics, set RTC_RELAY_ONLY=true with a real relay configuration and restart. Verify inbound media on both devices; then restore the desired policy. This setting does not create a relay.

The m-line association rule is defined in the W3C WebRTC RTP Media API: https://www.w3.org/TR/webrtc/#rtp-media-api

Device and capture references:

- https://www.w3.org/TR/audio-output/
- https://www.w3.org/TR/screen-capture/
- https://www.w3.org/TR/mediacapture-streams/
