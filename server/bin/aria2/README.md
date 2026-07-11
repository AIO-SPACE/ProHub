# aria2 bundle slot

ProHub looks here first for a bundled `aria2c` binary before checking `PATH`.

Expected paths:

- Windows x64: `server/bin/aria2/win32-x64/aria2c.exe`
- Linux x64: `server/bin/aria2/linux-x64/aria2c`
- macOS arm64: `server/bin/aria2/darwin-arm64/aria2c`

The backend will not fake downloads if the binary is absent. `/api/downloads/health`
reports the exact expected path and the Downloads UI shows the engine as
unavailable.

Bundled in this workspace:

- `win32-x64/aria2c.exe`
- Source: official `aria2/aria2` GitHub release asset
- Version: `aria2-1.37.0-win-64bit-build1`
- URL: `https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip`
