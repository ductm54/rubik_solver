# Real photos for the scanner tests

Each folder is one cube: six photos (one per face), cropped to the cube and its surroundings, and
`faces.json` with the face's corners in the photo and its 9 colours row by row as seen.

| Folder | What | Source |
| --- | --- | --- |
| `moyu-stickerless` | Hand-held stickerless cube with rounded pieces and an embossed logo on the white center, phone camera, cluttered room | Photos by the repository owner |
| `stickered-robot` | Stickered cube in a LEGO robot, overexposed webcam: white and yellow are almost the same pixel values, orange looks salmon, green looks mint | [dwalton76/rubiks-cube-tracker](https://github.com/dwalton76/rubiks-cube-tracker) `test-data/3x3x3-random-01`, MIT License (see `stickered-robot/LICENSE`) |
| `no-cube` | Views with no cube face: floor tiles, a desk, a hand, the robot, part of a cube | Cut from the photos above |
| `moyu-video` | The stickerless cube turned by hand in front of a phone, 14 s, 10 frames per second at 270 × 480; `video.json` lists the six faces in the order shown | Video by the repository owner |
| `moyu-video-2` | The same cube with its white side solved, in dim warm light, in front of a dark window that reflects it; 15 s | Video by the repository owner |

To add a cube: put six photos in a new folder, write `faces.json` the same way, and add the folder
name to `SETS` in `tests/scan-real.test.ts`. The first test checks that the labels form a valid cube.
