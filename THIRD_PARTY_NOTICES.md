# Third-party notices

Nexus retains its proprietary project license. The components below retain their own license rights and notices.

| Component | Version | License |
| --- | --- | --- |
| Express | 5.3.0 | MIT |
| Multer | 2.5.0 | MIT |
| Nodemailer | 10.2.1 | MIT-0 |
| web-push | 3.6.7 | MPL-2.0 |
| Socket.IO | 4.8.4 | MIT |
| ws | 8.21.3 | MIT |
| Inter variable font | 4.1 | SIL Open Font License 1.1, copyright 2016 The Inter Project Authors |
| Feather SVG adaptations | Locally maintained subset | MIT, copyright 2013–2023 Cole Bemis |

The bundled, unmodified Inter font is from the official rsms/inter v4.1 release tree. Its complete license is in `licenses/inter-font.txt` and `public/assets/fonts/LICENSE.txt`.

The Nodemailer notice is in `licenses/nodemailer.txt`. The full Feather notice is in `licenses/feather-icons.txt`. Exact license files from installed production dependencies are collected in `licenses/runtime-dependencies.txt`. The app serves the same notices at `/third-party-notices.txt`.

Dependencies installed by npm retain their original license files. Rebuild the notice inventory when updating the dependency graph. No third-party trademark endorsement is implied.

The unmodified web-push package provides Web Push encryption and VAPID signing. Its full license is in `licenses/web-push.txt`; source is available from https://github.com/web-push-libs/web-push and the exact npm package version pinned above. Transitive cryptography/transport dependencies retain their included license texts.
