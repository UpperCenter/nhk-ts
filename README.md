# NHK-TS

![NHK-TS ASCII Art](_img/ascii-art.png)

A specialised command-line tool designed for archivists and enthusiasts to manage their NHK World Japan TVHeadEnd satellite recordings. This tool automates the process of identifying programme boundaries, managing metadata, and optimising recordings for modern media servers.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.0+-green.svg)](https://nodejs.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Required-orange.svg)](https://ffmpeg.org/)
[![ImageMagick](https://img.shields.io/badge/ImageMagick-Required-orange.svg)](https://imagemagick.org/)
[![TVHeadEnd](https://img.shields.io/badge/TVHeadEnd-Compatible-blue.svg)](https://tvheadend.org/)
[![Status](https://img.shields.io/badge/Status-Alpha-red.svg)](https://github.com/UpperCenter/nhk-ts)
[![TVDB](https://img.shields.io/badge/TVDB-API%20Required-yellow.svg)](https://thetvdb.com/)

## Key Features

- **Precise Programme Detection**: Identifies exact programme start and end times by analysing both black screens and silent periods during the first and last few minutes of recordings
- **TVDB Integration**: Automatically retrieves and parses programme names, years, and episode information from TheTVDB
- **Intelligent Caching**: Minimises TVDB API requests by caching programme metadata
- **Format Optimisation**: Transcodes 1080i interlaced content into 1080p progressive format
- **Hardware Acceleration**: Supports NVIDIA NVENC, Intel QSV, and AMD VA-API for faster transcoding
- **Flexible Output**: Supports both MKV and MP4 containers for compatibility with:
  - Plex
  - Jellyfin
  - Emby
  - VLC
  - Kodi
  - MPV
  - Other modern media players

## How It Works

### Programme Detection
The tool uses a two-step process to identify programme boundaries:

1. **Black Frame Analysis**
   - Scans the first 90 seconds and last 210 seconds of each recording (configurable)
   - Uses ImageMagick to detect black frames and programme logos
   - Compares frames against a reference image to identify programme transitions
   - Supports parallel processing for faster analysis

2. **Audio Analysis**
   - Detects silent periods using FFmpeg's silencedetect filter
   - Threshold: -80dB with minimum duration of 1.0 seconds (configurable)
   - Combines audio and video analysis for accurate boundary detection

### Metadata Management
- Automatically extracts programme information from custom TVHeadEnd `.nfo` files
- Queries TheTVDB API to enrich metadata with:
  - Programme titles
  - Episode numbers
  - Air dates
  - Series information
- Implements intelligent caching to minimise API calls
- Rate limits requests to comply with TVDB's API restrictions
- Uses Dice-Sørensen coefficient for fuzzy matching of programme descriptions
  - Helps match programmes even with slight variations in titles or descriptions, including punctuation
  - Threshold of 0.8 (80% similarity) for positive matches
- Supports blacklist patterns to skip unwanted programmes

### Transcoding Process
- Converts 1080i interlaced content to 1080p progressive format
- Supports ffmpeg quality presets
- Maintains original audio streams
- Outputs to either MKV or MP4 containers
- Uses CRF (Constant Rate Factor) for quality control
- Automatic hardware acceleration detection and fallback to software encoding

## Installation

### Prerequisites

- Node.js 22.0 or higher
- FFmpeg with hardware acceleration support (optional)
- ImageMagick
- TVDB API key (for metadata lookup)

### System Installation

```bash
# Clone the repository
git clone https://github.com/UpperCenter/nhk-ts.git
cd nhk-ts

# Install dependencies
npm install

# Build the project
npm run build

# Run the tool
node dist/cli.js --help
```

### Docker Installation

The tool is available as a Docker image with built-in GPU support:

```bash
# Build the container
docker build -t nhk-ts .

# Run with basic functionality
docker run --rm -v /path/to/input:/input -v /path/to/output:/output nhk-ts --help
```

## Usage

### Basic Usage

```bash
# Process all .ts files in a directory
nhk-ts --input /path/to/recordings --output /path/to/output

# Process a single file
nhk-ts --file /path/to/recording.ts --output /path/to/output

# Test mode (analysis only, no modifications)
nhk-ts --input /path/to/recordings --test

# Enable metadata lookup (requires TVDB API key)
nhk-ts --input /path/to/recordings --metadata --tvdb-api-key YOUR_API_KEY
```

### Advanced Options

```bash
# Transcode with hardware acceleration
nhk-ts --input /path/to/recordings --transcode --hw-accel auto --best

# Use specific encoder and quality settings
nhk-ts --input /path/to/recordings --transcode --encoder hevc_nvenc --preset p7 --crf 18

# Custom black detection parameters
nhk-ts --input /path/to/recordings --min-black 0.1 --pix-threshold 0.15 --start-window 120 --end-window 180

# Parallel processing for faster analysis
nhk-ts --input /path/to/recordings --parallelism 16
```

## Docker GPU Support

### Prerequisites

- NVIDIA GPU with NVENC support (GTX 1050 or newer, RTX series recommended)
- NVIDIA drivers installed on host system
- NVIDIA Container Toolkit installed

### Installing NVIDIA Container Toolkit

#### Ubuntu/Debian:
```bash
# Add NVIDIA package repositories
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

# Install nvidia-container-toolkit
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Restart Docker daemon
sudo systemctl restart docker
```

#### Fedora/RHEL/CentOS:
```bash
# Add NVIDIA package repositories
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.repo | sudo tee /etc/yum.repos.d/nvidia-docker.repo

# Install nvidia-container-toolkit
sudo dnf install -y nvidia-container-toolkit

# Restart Docker daemon
sudo systemctl restart docker
```

#### Arch Linux:
```bash
# Install from AUR
yay -S nvidia-container-toolkit

# Or using paru
paru -S nvidia-container-toolkit

# Restart Docker daemon
sudo systemctl restart docker
```

### Running with GPU Support

#### Method 1: Using --gpus flag (Recommended)

```bash
# Basic GPU-enabled run
docker run --gpus all \
  -v /path/to/input:/input \
  -v /path/to/output:/output \
  nhk-ts --transcode --best --audio-copy

# With specific GPU (if multiple GPUs)
docker run --gpus '"device=0"' \
  -v /path/to/input:/input \
  -v /path/to/output:/output \
  nhk-ts --transcode --best --audio-copy
```

#### Method 2: Using --runtime=nvidia (Legacy)

```bash
docker run --runtime=nvidia \
  -v /path/to/input:/input \
  -v /path/to/output:/output \
  nhk-ts --transcode --best --audio-copy
```

#### Method 3: Docker Compose

Create a `docker-compose.gpu.yml`:

```yaml
version: '3.8'

services:
  nhk-ts:
    image: nhk-ts
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    volumes:
      - ./input:/input
      - ./output:/output
      - ./cache:/cache
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - NVIDIA_DRIVER_CAPABILITIES=compute,video,utility
```

Run with:
```bash
docker compose -f docker-compose.gpu.yml run nhk-ts --transcode --best --audio-copy
```

### GPU Verification

```bash
# Test if NVIDIA GPU is accessible in container
docker run --gpus all nhk-ts nvidia-smi

# Test NVENC encoding capability
docker run --gpus all nhk-ts ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -t 1 -c:v hevc_nvenc -f null -
```

### Supported GPU Encoders

- **NVIDIA NVENC**: `h264_nvenc`, `hevc_nvenc` (GTX 1050+, RTX series)
- **Intel QSV**: `h264_qsv`, `hevc_qsv` (if Intel GPU present)
- **AMD VA-API**: `h264_vaapi`, `hevc_vaapi` (if AMD GPU present)

## Configuration

### Blacklist Support

Create a `blacklist.json` file in the working directory to skip certain programmes:

```json
[
    "Lunch On",
    "*mini"
]
```

Wildcard patterns are supported using `*` for any characters.

### Environment Variables

- `TVDB_API_KEY`: Your TVDB API key for metadata lookup
- `NODE_ENV`: Set to `production` for optimised performance

## Troubleshooting

### GPU Not Detected
1. Verify NVIDIA drivers: `nvidia-smi`
2. Check Docker GPU support: `docker run --gpus all nvidia/cuda:11.0-base nvidia-smi`
3. Ensure NVIDIA Container Toolkit is installed and Docker restarted

### Permission Issues
The container runs as user `nhk` (UID 1000). Ensure your host directories have appropriate permissions:
```bash
sudo chown -R 1000:1000 /path/to/input /path/to/output
```

### Fallback to CPU
If GPU is not available, NHK-TS will automatically fall back to CPU encoding (libx264/libx265).

## Performance Tips

### For Best GPU Utilisation:
```bash
docker run --gpus all \
  -v /path/to/input:/input \
  -v /path/to/output:/output \
  nhk-ts --transcode --best --encoder hevc_nvenc --audio-copy
```

### For Multiple Files:
```bash
docker run --gpus all \
  -v /path/to/input:/input \
  -v /path/to/output:/output \
  nhk-ts --transcode --hw-accel auto --parallelism 8
```

## Notes

- GPU encoding typically uses less CPU but may have slightly different quality characteristics than software encoding
- The `--best` flag automatically selects optimal settings for available hardware
- Container will gracefully fall back to CPU encoding if GPU is unavailable
- This tool is in ALPHA and uses significant CPU/RAM resources. Use at your own risk.

## Wiki

For detailed information, frequently asked questions, installation instructions, and more, please refer to the [GitHub Wiki](https://github.com/UpperCenter/nhk-ts/wiki).