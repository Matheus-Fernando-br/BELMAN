# Worker do módulo Redes Sociais (Render, runtime docker).
# Contexto do build: raiz do repositório (precisa de shared/ e worker/).
FROM node:22-bookworm-slim AS base
ENV DEBIAN_FRONTEND=noninteractive TZ=America/Sao_Paulo NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates curl tzdata fonts-dejavu-core \
      # dependências do Chromium headless (Remotion)
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 \
      libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*

# ---------- whisper.cpp (legendas de vídeo enviado) — compilado à parte
FROM node:22-bookworm-slim AS whisper
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates curl && rm -rf /var/lib/apt/lists/*
ARG WHISPER_VERSION=v1.7.6
RUN git clone --depth 1 --branch ${WHISPER_VERSION} https://github.com/ggml-org/whisper.cpp /src \
 && cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF \
 && cmake --build /build -j --config Release --target whisper-cli \
 && mkdir -p /opt/whisper && cp /build/bin/whisper-cli /opt/whisper/ \
 && curl -fsSL -o /opt/whisper/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin

# ---------- app
FROM base
WORKDIR /app
# Piper TTS + voz pt_BR-faber-medium (narração opcional, zero token)
ARG PIPER_VERSION=2023.11.14-2
RUN mkdir -p /opt/piper \
 && curl -fsSL https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_linux_x86_64.tar.gz | tar -xz -C /opt \
 && curl -fsSL -o /opt/piper/pt_BR-faber-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx \
 && curl -fsSL -o /opt/piper/pt_BR-faber-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json
COPY --from=whisper /opt/whisper /opt/whisper

COPY shared /shared
COPY worker/package.json worker/package-lock.json ./
RUN npm ci --omit=dev && node -e "import('@remotion/renderer').then((r) => r.ensureBrowser())"
COPY worker/tsconfig.json ./
COPY worker/src ./src
COPY worker/assets ./assets

# usuário sem privilégios
RUN useradd -m worker && chown -R worker /app
USER worker
CMD ["npx", "tsx", "src/index.ts"]
