FROM archlinux:latest AS builder

RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    curl \
    ca-certificates \
    gnupg \
    base-devel

RUN pacman -S --noconfirm nodejs npm

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM archlinux:latest

RUN pacman -Syu --noconfirm && \
    pacman -S --noconfirm \
    curl \
    ca-certificates \
    gnupg \
    bash \
    mediainfo \
    base-devel \
    libjpeg-turbo \
    libpng \
    libtiff \
    giflib \
    freetype2 \
    lcms2 \
    libxml2 \
    wget \
    nodejs \
    npm \
    imagemagick \
    ffmpeg \
    x264 \
    x265 \
    libvpx \
    opus \
    lame \
    libvorbis \
    aom \
    dav1d \
    svt-av1 \
    libass \
    fribidi \
    fontconfig \
    harfbuzz \
    ncurses \
    less && \
    pacman -Scc --noconfirm

# Install NVIDIA Container Toolkit components (for GPU support)
# Note: The actual NVIDIA drivers and libraries will be mounted from the host
RUN mkdir -p /usr/local/nvidia/bin /usr/local/nvidia/lib64

RUN groupadd -g 1000 nhk && useradd -r -u 1000 -g nhk nhk

WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

RUN mkdir -p /input /output /cache && chown -R nhk:nhk /app /input /output /cache

USER nhk

ENV NODE_ENV=production
ENV TERM=xterm-256color
ENV COLORTERM=truecolor
ENV FORCE_COLOR=1

# NVIDIA GPU support environment variables
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,video,utility
ENV PATH=/usr/local/nvidia/bin:${PATH}
ENV LD_LIBRARY_PATH=/usr/local/nvidia/lib64:${LD_LIBRARY_PATH}

VOLUME ["/input", "/output", "/cache"]

ENTRYPOINT ["node", "/app/dist/cli.js"]

CMD ["--help"]
