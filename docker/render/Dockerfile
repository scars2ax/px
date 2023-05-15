# syntax = docker/dockerfile:1.2

FROM node:18-bullseye-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN --mount=type=secret,id=_env,dst=/etc/secrets/.env cat /etc/secrets/.env >> .env
EXPOSE 80
CMD [ "npm", "start" ]
