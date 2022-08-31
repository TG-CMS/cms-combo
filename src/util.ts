import axios from 'axios';
import * as zlib from 'zlib';
import * as path from 'path';
import * as fse from 'fs-extra';
import * as mkdirp from 'mkdirp';
import * as tar from 'tar';
const urlJoin = require('url-join');
export const getNpmInfo = async (
  npm: string,
  registry = 'https://registry.npmjs.org',
) => {
  const url = urlJoin(registry, npm);
  const { data } = await axios.get(url);
  return data;
};
export function getTarball(info, version = 'latest') {
  version = info['dist-tags'][version] || info['dist-tags'].latest;
  const pkg: any = info.versions[version] || {};
  return {
    tarball: pkg.dist.tarball,
    version,
  };
}
export async function downTarball(destDir: string, tarball: string) {
  const allFiles = [];
  const allWriteStream = [];
  const dirCollector = [];
  const response = await axios({
    url: tarball,
    timeout: 10000,
    responseType: 'stream',
  });
  const getFiles = async () => {
    return new Promise((resolve, reject) => {
      response.data
        // @ts-ignore
        .pipe(zlib.Unzip())
        // @ts-ignore
        .pipe(new tar.Parse())
        .on('entry', (entry) => {
          if (entry.type === 'Directory') {
            entry.resume();
            return;
          }
          const realPath = entry.path.replace(/^package\//, '');
          const filename = path.basename(realPath);

          const destPath = path.join(destDir, path.dirname(realPath), filename);
          const dirToBeCreate = path.dirname(destPath);
          if (!dirCollector.includes(dirToBeCreate)) {
            dirCollector.push(dirToBeCreate);
            mkdirp.sync(dirToBeCreate);
          }

          allFiles.push(destPath);
          allWriteStream.push(
            new Promise((streamResolve) => {
              entry
                .pipe(fse.createWriteStream(destPath))
                .on('finish', () => streamResolve(true))
                .on('close', () => streamResolve(true)); // resolve when file is empty in node v8
            }),
          );
        })
        .on('end', () => {
          resolve(allFiles);
        })
        .on('error', () => {
          reject(allFiles);
        });
    });
  };
  await getFiles();
  return await Promise.all(allWriteStream);
}
export async function getPackages({ name, version, rootDir }) {
  const info = await getNpmInfo(name);
  const pkg = getTarball(info, version);
  const pkgDir = path.join(rootDir, name, pkg.version);
  const isDown = await fse.pathExists(pkgDir);
  if (!isDown) {
    await downTarball(pkgDir, pkg.tarball);
  }
  return {
    pkgDir,
    ...pkg,
  };
}
export async function getPackageFile({ name, version, rootDir }) {
  let _version = version;
  const dir = path.join(rootDir, name, version);
  const isDir = await fse.pathExists(dir);
  if (!isDir) {
    const down = await getPackages({
      name,
      version,
      rootDir,
    });
    if (_version === 'latest') {
      _version = down.version;
    }
  }
  const filedir = path.join(rootDir, name, _version);
  const packageJson = await fse.readJSON(path.join(filedir, 'package.json'));
  const filePath =
    packageJson.unpkg ||
    packageJson.jsdelivr ||
    packageJson.browser ||
    packageJson.main ||
    'index.ts';
  return await fse.readFile(path.join(filedir, filePath));
}
