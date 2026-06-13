FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

# Expose port 7860 (Hugging Face Spaces default container port)
EXPOSE 7860

ENV PORT=7860

CMD ["node", "index.js"]
