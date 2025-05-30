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
    ffmpeg && \
    pacman -Scc --noconfirm

RUN groupadd -g 1001 nhk && useradd -r -u 1001 -g nhk nhk

WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

RUN mkdir -p /input /output /cache && chown -R nhk:nhk /app /input /output /cache

USER nhk

ENV NODE_ENV=production

VOLUME ["/input", "/output", "/cache"]

ENTRYPOINT ["node", "/app/dist/cli.js"]

CMD ["--help"]
