# syntax = docker/dockerfile:1.2

FROM node:18-bullseye-slim
RUN apt-get update && \
    apt-get install -y curl
    
# Unlike Huggingface, Render can only deploy straight from a git repo and
# doesn't allow you to create or modify arbitrary files via the web UI.

# If you want to add a custom `greeting.md` file, you can do so by creating a
# new secret file in Render's Environment UI. Name the secret `greeting.md` and
# paste the contents of your `greeting.md` file into the value field.

RUN --mount=type=secret,id=greeting,dst=/etc/secrets/greeting.md cat /etc/secrets/greeting.md > /greeting.md    

WORKDIR /app
COPY package*.json greeting.md* ./
RUN npm install
COPY . .
RUN npm run build
RUN --mount=type=secret,id=_env,dst=/etc/secrets/.env cat /etc/secrets/.env >> .env
EXPOSE 10000
ENV NODE_ENV=production
CMD [ "npm", "start" ]
