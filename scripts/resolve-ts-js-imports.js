// Le client Prisma généré importe en NodeNext (`./internal/class.js`), que le resolver
// CommonJS de Node ne rattache pas aux sources `.ts`. Même contournement que le
// `moduleNameMapper` des deux configurations Jest (voir DECISIONS.md, lot 0), côté
// ts-node : préchargé par `npm run seed`, il n'affecte ni l'application ni le build.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const resolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, ...rest) {
  if (parent?.filename && request.endsWith('.js') && /^\.{1,2}\//.test(request)) {
    const source = path.resolve(
      path.dirname(parent.filename),
      `${request.slice(0, -'.js'.length)}.ts`,
    );
    if (fs.existsSync(source)) return source;
  }

  return resolveFilename.call(this, request, parent, ...rest);
};
