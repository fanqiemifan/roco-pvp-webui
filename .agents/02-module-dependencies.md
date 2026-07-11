# 模块依赖/导入映射

```
socket-server.ts
├── match-service.ts
│   ├── shared/types.ts
│   ├── shared/constants.ts
│   └── path-service.ts
├── state-service.ts
│   ├── shared/types.ts
│   ├── shared/constants.ts
│   └── path-service.ts
├── sprite-service.ts
│   ├── shared/types.ts
│   ├── shared/constants.ts
│   └── path-service.ts
├── image-service.ts
│   ├── shared/types.ts
│   └── path-service.ts
├── config-service.ts
│   ├── shared/constants.ts
│   └── path-service.ts
└── path-service.ts

admin-antd/App.tsx
├── shared/events.ts
└── shared/types.ts

login-antd/App.tsx
└── shared/types.ts
```