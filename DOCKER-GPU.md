# Docker GPU Support for NHK-TS

This document explains how to run NHK-TS with GPU acceleration in Docker containers.

## Prerequisites

### 1. NVIDIA GPU Support
- NVIDIA GPU with NVENC support (GTX 1050 or newer, RTX series recommended)
- NVIDIA drivers installed on host system
- NVIDIA Container Toolkit installed

### 2. Install NVIDIA Container Toolkit

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

## Building the Container

Build the container normally (GPU support is built-in):

```bash
docker build -t nhk-ts .
```

## Running with GPU Support

### Method 1: Using --gpus flag (Recommended)

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

### Method 2: Using --runtime=nvidia (Legacy)

```bash
docker run --runtime=nvidia \
  -v /path/to/input:/input \
  -v /path/to/output:/output \
  nhk-ts --transcode --best --audio-copy
```

### Method 3: Docker Compose

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

## Verification

### Test GPU Access
```bash
# Test if NVIDIA GPU is accessible in container
docker run --gpus all nhk-ts nvidia-smi

# Test NVENC encoding capability
docker run --gpus all nhk-ts ffmpeg -f lavfi -i testsrc=duration=1:size=320x240:rate=1 -t 1 -c:v hevc_nvenc -f null -
```

### Expected Output
When GPU acceleration is working, you should see:
- GPU utilization 15-40% during transcoding
- Faster encoding speeds compared to CPU-only
- `hevc_nvenc` or `h264_nvenc` in the encoding logs

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

### For Best GPU Utilization:
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

## Supported GPU Encoders

- **NVIDIA NVENC**: `h264_nvenc`, `hevc_nvenc` (GTX 1050+, RTX series)
- **Intel QSV**: `h264_qsv`, `hevc_qsv` (if Intel GPU present)
- **AMD VA-API**: `h264_vaapi`, `hevc_vaapi` (if AMD GPU present)

## Notes

- GPU encoding typically uses less CPU but may have slightly different quality characteristics than software encoding
- The `--best` flag automatically selects optimal settings for available hardware
- Multiple GPU support available by specifying device IDs
- Container will gracefully fall back to CPU encoding if GPU is unavailable
