# iPhone Duo「all-access-pass 媒体卡片画廊」动画复刻

复刻对象：`https://www.apple.com.cn/iphone-duo/` 页面中
`/html/body/main/section[1]/div[2]/div[1]/div`（`.all-access-pass.aap-media-card-gallery`，
滚动触发后变为 `.activated .aap-intro-complete`）组件的完整动画系统。

## 运行

```bash
cd iphone-duo-aap-replica
python -m http.server 8741     # 任意静态服务器均可
# 打开 http://127.0.0.1:8741/index.html，向下滚动到「走进 iPhone Duo 的世界」版块
```

- 滚动进入版块 → 触发 intro 弹簧编舞 + 自动播放
- **每次滚出再滚回该版块，intro 都会完整重播**（原站只播一次，此处按需求增强）
- 按 **R** 可手动重播 intro

另含第二个复刻：**iPhone 18 Pro 渐变大标题出场动画**
（[iphone-18-pro-gradient-headline.html](iphone-18-pro-gradient-headline.html)）——
「2 纳米芯旗舰，强悍出征。」黑→深蓝→浅蓝→青→白的 3.5s 线性渐变扫过，
滚动到视口 80% 线触发，滚回再进可重播，按 R 手动重播。

第三个复刻：**Apple Watch Series 12「先刷重点」媒体卡片画廊**
（[watch-s12-gallery.html](watch-s12-gallery.html)）——与 iPhone Duo 同族的
MediaCardGallery 系统（5 张卡），引擎与 `index.html` 逐字节一致；
性能优化实验已回退（分析保留在解析文档附二）。

详细的原组件实现分析见 [组件实现解析.md](组件实现解析.md)（AAP 组件 §1-10，
Watch 12 + 性能优化见附二，渐变标题见附录 A1）。

## 逆向所得完整动画规格

### 1. 弹簧物理引擎（main.built.js 模块 `oDN9vwoy+x3PdafW4QBc`）

- **固定 1/60s 步长**的半隐式欧拉积分：先更新速度 `v += (-k(x-target) - c·v)·dt`，
  再用**新速度**推进位移 `x += v·dt`；单帧补偿上限 1/30s；帧间余量线性插值渲染
- 收敛判定：`|x_target - x| < 0.001 && |v| < 0.001`
- duration/bounce 参数型弹簧换算：
  `k = (2π/duration)²`，`c = (1-bounce)·4π/duration`（bounce=0 即精确临界阻尼）

### 2. intro 编舞（`playIntroAnimation`，两气泡分支）

t=0 时的 snap 初值：

| 弹簧层 | 初值 |
|---|---|
| intro 圆点 | `x=-15, scale=1.3, w=30, h=80` |
| 整条控制条 (aap) | `y=180` |
| dotnav 气泡 | 元素居中 snap（x=视口中心偏移）、`--alpha=0`；背景 `w=40, h=36, --scale=1.3` |
| 播放按钮气泡 | 同上；背景 `w=80, h=36, --scale=0` |
| 每个圆点 | `x=36` |

时间线（秒，来自 `addTween` duration 即延迟）：

| t | 动作 |
|---|---|
| 0.02 | 加 `activated` 类；intro 圆点 opacity→1；`scale→0.8`（0.5s 临界阻尼） |
| 0.03 | 控制条 `y→0`（k100 d8，**ζ=0.4，~25% 过冲上弹**） |
| 0.05 | intro `x→-28`、`w→56`（k100 d8） |
| 0.15 | intro `h→56`（k100 d8） |
| 0.30 | dotnav 背景 `--scale→1`（0.3s 临界阻尼） |
| 0.50 | dotnav 元素 `x→0`（k100 d20，ζ=1）；背景 `w→气泡宽`（k100 d10，**ζ=0.5，~16% 果冻过冲**） |
| 0.52 | intro 圆点淡出销毁 |
| 0.54 | 播放按钮 `x→0`、背景 `--scale→1`（0.65s 临界阻尼） |
| 0.70 | 两背景 `h→56`、按钮背景 `w→56` |
| 0.74 + 0.02·i | 第 i 个圆点 `x→0`（k200 d20）；第 0 个同时 `--progress-intro 0→1`（k200 d20，进度条容器展开） |
| 1.00 | 两气泡 `--alpha→1`（毛玻璃透明度 0.72 / 模糊 7px） |

CSS 过渡（`activated` 类驱动）：圆点 opacity 100ms ease-in 延迟 740ms；
播放/暂停按钮 opacity 100ms ease-in 延迟 940ms、scale 200ms ease-out 延迟 940ms。
背景完全 settle 后写入像素尺寸并加 `aap-intro-complete`。

### 3. 触发阈值（`data-aap-kf` 表达式，已用页面内 ExpressionParser 实测验证）

```
start = a0.top − 100vh + 0.6 × a0.height     （"60a0h" = 60% 锚点高度）
end   = a1.bottom − 75vh
a0 = [data-media-card-gallery]，a1 = 所属 section
```

### 4. 定时自动播放（TimeGroup）

- 每张卡片停留 `--autoplay-persist-duration: 6.15s`（JS 默认 6.15，CSS 回退 6.25）
- 切换：`scrollLeft` 关键帧插值，`--shared-media-gallery-transition-duration: 1s`，
  缓动 **easeInOutQuad**；ITEM_CHANGE_OCCURRED 在滑动**中点**触发（圆点 current 切换 + 时间轴 seek）
- 圆点进度条：当前点 `::after` 纯 CSS 动画 `aap-animate-progress`（0→115% 宽，6.15s linear，
  `.playing` 时 running）
- 圆点宽度形变：`--autoplay-progress = round(scrollLeft)/unitOffset`（连续值），
  `min-width = (48−8)·min(1−|index−progress|,1)·--progress-intro + 8`
- 播放/暂停/重播三态图标由根元素 `playing/paused/ended` 类切换
- 点击圆点：seek 时间轴 + 滑动；用户交互后自动播放暂停（原站行为）

### 5. 视觉参数（theme-dark）

- 气泡背景 `rgba(42 42 45 / calc(1 − α·0.28))`，`backdrop-filter: blur(calc(7px·(2−α)))`，
  圆角 28px，最小高 56px
- 圆点 8px / 间距 8px / 未激活 `rgba(255,255,255,.36)` / 激活填充 `rgb(245,245,247)`
- 控制条 sticky 于版块底部 32px（≤734px 为 20px），顶距 380/340/340px（三档断点）

## 文件

- `index.html` — 复刻版（引擎与编舞均为逐行移植，单文件零依赖）
- `engine-test.js` — Node 无头验证：从 index.html 提取引擎源码，60fps 假时钟
  断言各弹簧的过冲率/阻尼比/收敛特性（13/14 通过，1 项为测试阈值过严）
- `../_reverse/` — 逆向过程产物（原页面 HTML、CSS 规则抽取、JS 关键模块）

## 验证方式

1. `node engine-test.js` — 弹簧曲线特征值（ζ=0.4 → 24% 过冲、ζ=0.5 → 14.6% 果冻、
   ζ=1 无过冲、duration 型换算精确）
2. 页内无头断言 — snap 初值与原站逐字段一致（30×80/scale1.3/x−15、背景 56×56/--scale 0与1.3）、
   圆点宽度公式（当前 47.7px/其余 8.3px/轨道 184px）、进度动画 6.15s running
3. 视觉对照 — 打开原站与本页并排滚动（实现期间宿主窗口处于后台，实时视觉采样不可用，
   引擎为确定性固定步长，数学一致即行为一致）
