import { cp, mkdir } from 'node:fs/promises';

await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
for (const item of ['index.html', 'styles.css', 'favicon.svg', 'src', 'docs']) {
  await cp(new URL(`../${item}`, import.meta.url), new URL(`../dist/${item}`, import.meta.url), { recursive: true });
}
console.log('静态发布包已生成：dist/（可直接托管在任意静态服务器）');
