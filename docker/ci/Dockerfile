# Switched to alpine both for smaller image size and because zeromq.js provides
# a working prebuilt binary for alpine. On Debian, the prebuild was not working
# and a bug in libzmq's makefile was causing the build from source to fail.
# https://github.com/zeromq/zeromq.js/issues/529#issuecomment-1370721089
FROM node:18-alpine as builder

# Install general build dependencies
RUN apk add --no-cache autoconf automake g++ libtool zeromq-dev python3 \
    py3-pip git curl cmake gcc musl-dev pkgconfig openssl-dev
  
# Install Rust (required to build tokenizers)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

RUN git clone -b tokenize https://gitgud.io/khanon/oai-reverse-proxy.git /app
WORKDIR /app

RUN npm ci

RUN npm run build && \
    npm prune --production

FROM node:18-alpine as runner

RUN apk add --no-cache \
  zeromq-dev \
  python3

COPY --from=builder /app/build /app/build
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/package.json /app/package.json

WORKDIR /app
RUN . .venv/bin/activate

EXPOSE 7860

ENV NODE_ENV=production

# TODO: stamp with tag and git commit
ENV RENDER=true
ENV RENDER_GIT_COMMIT=ci-test

CMD [ "npm", "start" ]
