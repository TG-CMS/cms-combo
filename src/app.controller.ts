import {
  Controller,
  Get,
} from '@nestjs/common';
import { join } from 'path';
import { readFile, pathExists, writeFile, ensureDir } from 'fs-extra';
import { minify } from 'terser';
import { AppService } from './app.service';
import { getPackageFile } from './util';
import * as pMap from 'p-map';
import { hash } from 'ohash';
@Controller('combo')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/:name')
  async getHello() {
    const packages = 'vue,vue-router,axios,qs'.split(',');
    const rootDir = join(process.cwd(), '.cache');
    const rootNpmDir = join(rootDir, 'npm');
    const rootComboDir = join(rootDir, 'combo');
    const cacheName = `${hash(packages)}.txt`;
    const cacheFile = join(rootComboDir, cacheName);
    const isCache = await pathExists(cacheFile);
    if (isCache) {
      const buffer = await readFile(cacheFile);
      return buffer.toString();
    }
    const mapper = async (item) => {
      try {
        const base = item.split('@');
        const name = base[0];
        const version = base[1] || 'latest';
        const js = await getPackageFile({
          name,
          version,
          rootDir: rootNpmDir,
        });
        return js.toString();
      } catch (e) {
        console.log(e);
        return '';
      }
    };
    const resultMap = await pMap(packages, mapper, { concurrency: 5 });
    const result = await minify(`${resultMap.join('')}`, { sourceMap: false });
    await ensureDir(rootComboDir);
    await writeFile(cacheFile, result.code);
    return result.code;
  }
}
