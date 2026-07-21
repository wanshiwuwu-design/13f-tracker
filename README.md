# 13F Tracker

一个面向美股机构持仓研究的 13F 跟踪工具，参考公开的 SEC EDGAR 13F 文件，提供机构、季度和持仓变化视图。

## 功能

- 从 SEC EDGAR 获取机构最新 13F 持仓
- 按机构和季度切换查看
- 展示新增、增持、减持、清仓和持仓不变
- 按股票、行业和变动类型筛选
- 深色 / 浅色模式，可记忆用户偏好
- 响应式仪表盘，适配桌面和移动端

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000。

## 构建

```bash
npm run build
```

## 数据说明

13F 文件由机构按季度提交，通常存在最多 45 天的披露延迟。本项目仅用于研究和信息展示，不构成投资建议。

## 在线预览

https://smart-money-13f.garfield-wu.chatgpt.site
