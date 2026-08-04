FROM node:26-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS development
COPY . ./
EXPOSE 4200
CMD ["npm", "start", "--", "--poll", "500"]

FROM dependencies AS builder
COPY . ./
RUN npm run build

FROM nginx:1.29-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/frontend/ /usr/share/nginx/html/
EXPOSE 80
