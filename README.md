# Aqua Manga

Aqua Manga 是一个用于分享个人漫画推荐与音乐收藏的静态网站。

网站采用蓝色、粉色与海军风格设计，视觉元素参考了湊あくあ的代表色与锚点元素。

## 主要功能

- 展示漫画封面、作者、简介与推荐语
- 按漫画名称或作者搜索
- 展示和播放音乐收藏
- 支持顺序播放、单曲循环与随机播放
- 支持多种播放器主题和毛玻璃效果
- 响应式布局，适配电脑和手机

## 技术说明

网站使用原生 HTML、CSS 和 JavaScript 构建，通过 GitHub Pages 部署。

漫画及音乐信息保存在：

```text
data/content.json
```

图片和音乐等较大资源建议存放在腾讯云对象存储 COS，网站通过公开 HTTPS 地址加载这些资源。

## 在线访问

[https://oldcatinside.github.io/aqua-manga.github.io/](https://oldcatinside.github.io/aqua-manga.github.io/)

## 注意事项

公开分享漫画截图和音乐时，请确保相关内容允许传播并遵守版权规定。
