/**
 * 用户头像字段统一：仅保留 avatar，删除 user_image。
 *
 * 规则：
 * - avatar 非空则沿用 avatar；
 * - 否则若有 user_image 则 avatar = user_image；
 * - 否则 avatar = 默认外链占位图；
 * - 所有文档 $unset user_image。
 *
 * 在 migrate_media_paths.mongosh.js（路径前缀）前后执行均可，建议先跑路径迁移再跑本脚本。
 *
 *   docker exec -i bolt_mongo mongosh -u admin -p '你的密码' --authenticationDatabase admin bolt_painting < BoltPaint/backend/database/migrate_users_avatar_unify.mongosh.js
 */

db = db.getSiblingDB('bolt_painting');

const DEFAULT_AVATAR = 'https://picsum.photos/id/64/200/200';

print('[*] users 头像字段统一：仅保留 avatar，移除 user_image');

let n = 0;
db.users.find({}).forEach((doc) => {
  const av = doc.avatar;
  const hasAvatar = typeof av === 'string' && av.trim() !== '';
  const legacy = doc.user_image;
  const hasLegacy = typeof legacy === 'string' && legacy.trim() !== '';

  let finalAvatar = hasAvatar ? String(av).trim() : hasLegacy ? String(legacy).trim() : DEFAULT_AVATAR;

  db.users.updateOne(
    { _id: doc._id },
    { $set: { avatar: finalAvatar }, $unset: { user_image: '' } }
  );
  n += 1;
});

print('[+] 已处理 users 文档数: ' + n);
print('    抽查: db.users.findOne({}, { avatar: 1, user_image: 1 }) 应无 user_image 字段');
