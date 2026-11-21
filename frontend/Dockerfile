# 화면은 빌드한 정적 파일이라, Node로 빌드하고 공식 nginx 이미지로 내준다.
FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# 타입 검사는 CI가 한다. 테스트 파일이 이 폴더 밖의 contracts/를 읽어 여기서는 묶기만 한다.
RUN pnpm exec vite build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
