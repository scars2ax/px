# syntax = docker/dockerfile:1.2

FROM node:18-bullseye-slim
RUN apt-get update && \
    apt-get install -y curl
    
# Unlike Huggingface, Render can only deploy straight from a git repo and
# doesn't allow you to create or modify arbitrary files via the web UI.
# If you want to add a custom `greeting.md` file, push the file somewhere 
# (like a GitHub Gist or GitLab Snippet) and then set the `GREETING_URL` in
# your Render environment variables to the URL of the file. It must be a raw
# text file, not an HTML page.
RUN curl -o greeting.md $GREETING_URL; exit 0

WORKDIR /app
COPY package*.json greeting.md* ./
RUN npm install
COPY . .
RUN npm run build
RUN --mount=type=secret,id=_env,dst=/etc/secrets/.env cat /etc/secrets/.env >> .env
EXPOSE 10000
ENV NODE_ENV=production
CMD [ "npm", "start" ]
