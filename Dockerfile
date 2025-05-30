FROM ubuntu:24.04 AS builder

RUN apt-get update && apt-get install -y \
    curl \
    apt-transport-https \
    ca-certificates \
    gnupg

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl \
    apt-transport-https \
    ca-certificates \
    gnupg \
    software-properties-common \
    bash \
    mediainfo \
    build-essential \
    libltdl-dev \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libgif-dev \
    libfreetype6-dev \
    liblcms2-dev \
    libxml2-dev \
    wget

# Install ImageMagick 7 from source
RUN wget https://imagemagick.org/archive/ImageMagick.tar.gz && \
    tar xzf ImageMagick.tar.gz && \ 
    cd ImageMagick-7.1.1-* && \
    ./configure --with-modules && \
    make && \
    make install && \
    ldconfig /usr/local/lib && \
    cd .. && \
    rm -rf ImageMagick-7.1.1-* ImageMagick.tar.gz

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    add-apt-repository ppa:ubuntuhandbook1/ffmpeg7 && \
    apt-get update && apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

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
