/**
 * BoltPaint 图片 URL 前缀迁移：
 *   - /static | /generated | /custom → /boltPaint/static|generated|custom
 *   - /images/ → /boltPaint/images/（与 webApp public 静态资源、Vite base 一致）
 *
 * 用法（在宿主机 BoltSeries 根目录或本文件所在目录）：
 *
 *   docker exec -i bolt_mongo mongosh -u admin -p '你的密码' --authenticationDatabase admin bolt_painting < BoltPaint/backend/database/migrate_media_paths.mongosh.js
 *
 * 密码与 docker-compose.yml 中 MONGO_INITDB_ROOT_PASSWORD 一致。
 * 数据库名须与 MONGODB_URL 路径段一致（默认 bolt_painting）。
 *
 * 幂等：已含 /boltPaint/ 前缀的字符串不会被错误改写。
 */

// 强制使用业务库（避免交互式里误连到 test 等）
db = db.getSiblingDB('bolt_painting');

function upgradePath(u) {
  if (typeof u !== 'string' || !u) return u;
  if (
    u.startsWith('/boltPaint/static/') ||
    u.startsWith('/boltPaint/generated/') ||
    u.startsWith('/boltPaint/custom/') ||
    u.startsWith('/boltPaint/images/')
  ) {
    return u;
  }
  if (u.startsWith('/static/')) return '/boltPaint' + u;
  if (u.startsWith('/generated/')) return '/boltPaint' + u;
  if (u.startsWith('/custom/')) return '/boltPaint' + u;
  if (u.startsWith('/images/')) return '/boltPaint' + u;
  return u;
}

print('[*] BoltPaint 媒体路径迁移开始（库: bolt_painting）');

// ---------- tasks / artworks / templates：顶层字段 + reference_images（存储三前缀）----------
['tasks', 'artworks', 'templates'].forEach((col) => {
  ['/static/', '/generated/', '/custom/'].forEach((p) => {
    const newP = '/boltPaint' + p;
    const regStr = '^' + p.replace(/\//g, '\\/');

    ['image_url', 'thumbnail_url', 'cover_image'].forEach((field) => {
      const r = db[col].updateMany(
        { [field]: { $regex: regStr } },
        [{ $set: { [field]: { $replaceOne: { input: `$${field}`, find: p, replacement: newP } } } }]
      );
      if (r.modifiedCount > 0) print(`  [${col}.${field}] ${p} → ${newP} : modified ${r.modifiedCount}`);
    });

    const r2 = db[col].updateMany(
      { reference_images: { $elemMatch: { $regex: regStr } } },
      [
        {
          $set: {
            reference_images: {
              $map: {
                input: '$reference_images',
                as: 'u',
                in: { $replaceOne: { input: '$$u', find: p, replacement: newP } },
              },
            },
          },
        },
      ]
    );
    if (r2.modifiedCount > 0) print(`  [${col}.reference_images] ${p} : modified ${r2.modifiedCount}`);
  });
});

// ---------- tasks / artworks / templates：/images/ → /boltPaint/images/ ----------
const imagesOld = '/images/';
const imagesNew = '/boltPaint/images/';
const imagesRegStr = '^\\/images\\/';

['tasks', 'artworks', 'templates'].forEach((col) => {
  ['image_url', 'thumbnail_url', 'cover_image'].forEach((field) => {
    const r = db[col].updateMany(
      { [field]: { $regex: imagesRegStr } },
      [{ $set: { [field]: { $replaceOne: { input: `$${field}`, find: imagesOld, replacement: imagesNew } } } }]
    );
    if (r.modifiedCount > 0) print(`  [${col}.${field}] /images/ → /boltPaint/images/ : modified ${r.modifiedCount}`);
  });

  const rImg = db[col].updateMany(
    { reference_images: { $elemMatch: { $regex: imagesRegStr } } },
    [
      {
        $set: {
          reference_images: {
            $map: {
              input: '$reference_images',
              as: 'u',
              in: {
                $cond: {
                  if: { $regexMatch: { input: '$$u', regex: '^/images/' } },
                  then: { $replaceOne: { input: '$$u', find: imagesOld, replacement: imagesNew } },
                  else: '$$u',
                },
              },
            },
          },
        },
      },
    ]
  );
  if (rImg.modifiedCount > 0) print(`  [${col}.reference_images] /images/ : modified ${rImg.modifiedCount}`);
});

// ---------- users：avatar（仅站内相对路径；https 不受影响；已废弃 user_image 请跑 migrate_users_avatar_unify.mongosh.js）----------
['/static/', '/generated/', '/custom/'].forEach((p) => {
  const newP = '/boltPaint' + p;
  const regStr = '^' + p.replace(/\//g, '\\/');
  const r = db.users.updateMany(
    { avatar: { $regex: regStr } },
    [{ $set: { avatar: { $replaceOne: { input: '$avatar', find: p, replacement: newP } } } }]
  );
  if (r.modifiedCount > 0) print(`  [users.avatar] ${p} : modified ${r.modifiedCount}`);
});

{
  const r = db.users.updateMany(
    { avatar: { $regex: imagesRegStr } },
    [{ $set: { avatar: { $replaceOne: { input: '$avatar', find: imagesOld, replacement: imagesNew } } } }]
  );
  if (r.modifiedCount > 0) print(`  [users.avatar] /images/ → /boltPaint/images/ : modified ${r.modifiedCount}`);
}

// ---------- artworks：user_avatar（保存作品时的作者头像快照；与 users 字段规则一致）----------
['/static/', '/generated/', '/custom/'].forEach((p) => {
  const newP = '/boltPaint' + p;
  const regStr = '^' + p.replace(/\//g, '\\/');
  const r = db.artworks.updateMany(
    { user_avatar: { $regex: regStr } },
    [{ $set: { user_avatar: { $replaceOne: { input: '$user_avatar', find: p, replacement: newP } } } }]
  );
  if (r.modifiedCount > 0) print(`  [artworks.user_avatar] ${p} : modified ${r.modifiedCount}`);
});

{
  const r = db.artworks.updateMany(
    { user_avatar: { $regex: imagesRegStr } },
    [{ $set: { user_avatar: { $replaceOne: { input: '$user_avatar', find: imagesOld, replacement: imagesNew } } } }]
  );
  if (r.modifiedCount > 0) print(`  [artworks.user_avatar] /images/ → /boltPaint/images/ : modified ${r.modifiedCount}`);
}

// ---------- tasks：comic_data.pages[].image_url / thumbnail_url ----------
db.tasks.find({ comic_data: { $exists: true } }).forEach((doc) => {
  const cd = doc.comic_data;
  if (!cd || !Array.isArray(cd.pages) || cd.pages.length === 0) return;
  let changed = false;
  const newPages = cd.pages.map((pg) => {
    const np = Object.assign({}, pg);
    ['image_url', 'thumbnail_url'].forEach((k) => {
      if (typeof np[k] === 'string') {
        const nu = upgradePath(np[k]);
        if (nu !== np[k]) changed = true;
        np[k] = nu;
      }
    });
    return np;
  });
  if (changed) {
    db.tasks.updateOne({ _id: doc._id }, { $set: { 'comic_data.pages': newPages } });
    print('  [tasks.comic_data.pages] updated task _id=' + doc._id);
  }
});

// ---------- artworks：comic_data.pages（若存在）----------
db.artworks.find({ comic_data: { $exists: true } }).forEach((doc) => {
  const cd = doc.comic_data;
  if (!cd || !Array.isArray(cd.pages) || cd.pages.length === 0) return;
  let changed = false;
  const newPages = cd.pages.map((pg) => {
    const np = Object.assign({}, pg);
    ['image_url', 'thumbnail_url'].forEach((k) => {
      if (typeof np[k] === 'string') {
        const nu = upgradePath(np[k]);
        if (nu !== np[k]) changed = true;
        np[k] = nu;
      }
    });
    return np;
  });
  if (changed) {
    db.artworks.updateOne({ _id: doc._id }, { $set: { 'comic_data.pages': newPages } });
    print('  [artworks.comic_data.pages] updated artwork _id=' + doc._id);
  }
});

print('[+] 迁移完成。抽查示例:');
print('    db.artworks.countDocuments({ image_url: /^\\/static\\// }) 应为 0');
print('    db.artworks.countDocuments({ user_avatar: /^\\/static\\// }) 应为 0');
print('    db.users.countDocuments({ avatar: /^\\/images\\// }) 应为 0（若仍用旧字段先跑 migrate_users_avatar_unify.mongosh.js）');
