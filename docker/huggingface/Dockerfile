FROM node:18-bullseye-slim
RUN apt-get update && \
    apt-get install -y git python3 python3-pip libzmq3-dev
RUN git clone https://gitgud.io/khanon/oai-reverse-proxy.git /app
WORKDIR /app
RUN pip3 install --no-cache-dir -r requirements.txt
RUN npm install
COPY Dockerfile greeting.md* .env* ./
RUN npm run build
EXPOSE 7860
ENV NODE_ENV=production
CMD [ "npm", "start" ]
