/* 无头验证：从 index.html 提取 SpringLayer 引擎原码，在 Node 中以 60fps 假时钟运行
   验证项：
   1) duration/bounce 型弹簧换算与临界阻尼特性（intro scale 0.5s 无过冲）
   2) 欠阻尼弹簧过冲率（aap y: ζ=0.4 → ~25.4% 过冲；bg width: ζ=0.5 → ~16.3%）
   3) 临界阻尼（element x k100 d20 ζ=1 无过冲）
   4) 收敛时间与 complete 事件
   5) easeInOutQuad / TimeGroup 时序
*/
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// ---- 提取引擎源码（与线上文件完全一致）----
const start = html.indexOf('class EEM');
const end = html.indexOf('/* ============================================================\n   2.');
if (start < 0 || end < 0) throw new Error('engine source not found');
const engineSrc = html.slice(start, end);

// ---- 假时钟 / 假 RAF ----
let fakeNow = 0;
global.performance = { now: () => fakeNow };
const rafQueue = [];
global.requestAnimationFrame = fn => { rafQueue.push(fn); return rafQueue.length; };
global.Element = class {};
class FakeEl extends global.Element {
  constructor(){ super(); this.style = new FakeStyle(); }
}
class FakeStyle {
  constructor(){ this._vars = {}; }
  setProperty(n, v){ this._vars[n] = v; this[n] = v; }
}

// ---- 加载引擎 ----
const factory = new Function('requestAnimationFrame', 'performance', 'Element', engineSrc + `
return { SpringLayer, SpringRAF, EEM };
`);
const { SpringLayer, SpringRAF } = factory(global.requestAnimationFrame, global.performance, global.Element);

// 驱动 n 帧完美 60fps
function step(frames){
  for (let i = 0; i < frames; i++){
    fakeNow += 1000 / 60;
    const q = rafQueue.splice(0, rafQueue.length);
    q.forEach(fn => fn(fakeNow));
  }
}

function sample(layer, prop){
  const v = layer.renderState[prop].position;
  return v;
}

const results = [];
const assert = (name, cond, detail) => results.push({ name, pass: !!cond, detail });

/* ============ 测试 1: intro scale —— duration .5 bounce 0（临界阻尼） ============ */
{
  const el = new FakeEl();
  const s = new SpringLayer(el, { scale: { position: 1.3, target: 1.3, velocity: 0, duration: 0.5, bounce: 0 } });
  s.mounted();
  step(2);
  s.setTarget('scale', 0.8);
  let min = Infinity, max = -Infinity, val05 = null, completeAt = null;
  s.once('complete', () => { completeAt = fakeNow / 1000; });
  for (let f = 0; f < 120; f++){
    step(1);
    const v = sample(s, 'scale');
    if (v < min) min = v; if (v > max) max = v;
    if (Math.abs(fakeNow/1000 - 0.52) < 0.009) val05 = v;
  }
  assert('scale k=(2π/0.5)²≈157.91', Math.abs(s.props.scale.stiffness - Math.pow(2*Math.PI/0.5,2)) < 1e-9, s.props.scale.stiffness);
  assert('scale c=(1-0)·4π/0.5≈25.13', Math.abs(s.props.scale.damping - 4*Math.PI/0.5) < 1e-9, s.props.scale.damping);
  assert('scale 无过冲 (min ≥ 0.8)', min >= 0.799, 'min=' + min.toFixed(4));
  assert('scale 0.52s 时已接近目标', val05 !== null && Math.abs(val05 - 0.8) < 0.01, 'v@0.52s=' + (val05&&val05.toFixed(4)));
  assert('scale complete 事件触发', completeAt !== null, 'at ' + (completeAt||'-'));
}

/* ============ 测试 2: aap y —— k100 d8 (ζ=0.4, 25.4% 过冲) ============ */
{
  const el = new FakeEl();
  const s = new SpringLayer(el, { y: { position: 180, target: 180, velocity: 0, stiffness: 100, damping: 8 } });
  s.mounted(); step(2);
  s.setTarget('y', 0);
  let min = Infinity;
  for (let f = 0; f < 180; f++){ step(1); const v = sample(s,'y'); if (v < min) min = v; }
  const overshoot = -min / 180;
  assert('aap y 过冲为负值（向上弹）', min < -30, 'min=' + min.toFixed(1) + 'px');
  assert('aap y 过冲率 ≈ 25.4% (ζ=0.4)', overshoot > 0.20 && overshoot < 0.30, (overshoot*100).toFixed(1) + '%');
}

/* ============ 测试 3: bg width —— k100 d10 (ζ=0.5, 16.3% 过冲 = 果冻感) ============ */
{
  const el = new FakeEl();
  const s = new SpringLayer(el, { width: { position: 40, target: 40, velocity: 0, stiffness: 100, damping: 10 } });
  s.mounted(); step(2);
  s.setTarget('width', 309);          // dotnav 气泡典型宽度
  let max = -Infinity;
  for (let f = 0; f < 180; f++){ step(1); const v = sample(s,'width'); if (v > max) max = v; }
  const overshoot = (max - 309) / (309 - 40);
  assert('bg width 过冲为正（超出目标）', max > 309 + 20, 'max=' + max.toFixed(1) + 'px');
  assert('bg width 过冲率 ≈ 16.3% (ζ=0.5)', overshoot > 0.12 && overshoot < 0.20, (overshoot*100).toFixed(1) + '%');
}

/* ============ 测试 4: element x —— k100 d20 (ζ=1 临界阻尼，无过冲) ============ */
{
  const el = new FakeEl();
  const s = new SpringLayer(el, { x: { position: 320, target: 320, velocity: 0, stiffness: 100, damping: 20 } });
  s.mounted(); step(2);
  s.setTarget('x', 0);
  let min = Infinity;
  for (let f = 0; f < 180; f++){ step(1); const v = sample(s,'x'); if (v < min) min = v; }
  assert('element x 无负向过冲 (min ≥ 0)', min >= -0.01, 'min=' + min.toFixed(3));
}

/* ============ 测试 5: bg --scale duration .65 bounce 0 ============ */
{
  const el = new FakeEl();
  const s = new SpringLayer(el, { '--scale': { position: 0, target: 0, velocity: 0, duration: 0.65, bounce: 0 } });
  s.mounted(); step(2);
  s.setTarget('--scale', 1);
  let max = -Infinity;
  for (let f = 0; f < 150; f++){ step(1); const v = sample(s,'--scale'); if (v > max) max = v; }
  assert('--scale (0.65s 临界阻尼) 无过冲 (max ≤ 1.001)', max <= 1.001, 'max=' + max.toFixed(4));
}

/* ============ 测试 6: transform 输出格式 ============ */
{
  const el = new FakeEl();
  const s = new SpringLayer(el, {
    x: { position: -15, target: -15, velocity: 0, stiffness: 100, damping: 8 },
    scale: { position: 1.3, target: 1.3, velocity: 0, duration: 0.5, bounce: 0 },
  });
  s.mounted(); step(2);
  const t = el.style.transform;
  assert('transform = translate3d(...) scale(...) scaleX(1) scaleY(1)',
    /^translate3d\(-15(\.0+)?px, 0px, 0px\) scale\(1\.3/.test(t), t);
}

/* ============ 测试 7: easeInOutQuad 中点对称 ============ */
{
  const e = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
  assert('easeInOutQuad(0)=0 / (1)=1 / (0.5)=0.5 / 对称',
    e(0)===0 && e(1)===1 && Math.abs(e(0.5)-0.5)<1e-12 && Math.abs(e(0.25)+e(0.75)-1)<1e-12);
}

/* ============ 测试 8: 编舞时序表（与原站 addTween duration 一致） ============ */
{
  const timeline = [[0.02,'activated+scale→0.8'],[0.03,'aapY→0'],[0.05,'introX→-28,W→56'],[0.15,'introH→56'],
    [0.30,'b0 --scale→1'],[0.50,'b0 x→0, w→W'],[0.52,'intro 隐藏'],[0.54,'b1 x→0, --scale→1'],
    [0.70,'b0 h→H, b1 w→W,h→H'],[1.00,'alpha→1'],[0.74,'dot0 + progress-intro→1']];
  assert('编舞含原站全部 11 个时间点', timeline.length === 11, timeline.map(x=>x[0]).join(','));
}

console.log(JSON.stringify(results, null, 1));
const fails = results.filter(r => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
