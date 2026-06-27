          
## Docker 部署命令

在 `/Users/john/Documents/AI coding/洛克王国PVP 图标/Webui-v2` 目录下执行：

```bash
# 重新构建镜像（包含新文件）
docker-compose build

# 重启容器
docker-compose up -d
```

如果容器已在运行，只需：

```bash
docker-compose up -d --build
```

## 说明
- `Dockerfile` 中 `COPY . /app` 会把 `live-control-core.js` 一起打包进镜像
- 新建的 `live-control-core.js` 会被复制到 `/app/live-control-core.js`