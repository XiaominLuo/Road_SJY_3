# RoadFinder 寻路者

## 项目简介
RoadFinder 是一个结合高精度卫星遥感与全民科学力量的地理标注平台。

## 快速部署 (Docker)

本项目已包含 Docker配置，支持一键构建和部署。Docker 会自动处理 `npm install` 和 `npm run build` 过程。

### 1. 构建镜像
```bash
docker build -t roadfinder .
```

### 2. 启动容器
```bash
docker run -d -p 80:80 roadfinder
```

启动后，访问服务器 IP 即可看到网站。

## 手动开发

如果您需要在本地开发：

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 手动构建生产环境代码 (生成 dist 目录)
npm run build
```
