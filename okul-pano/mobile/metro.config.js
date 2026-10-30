// Ortak paket (@okulpano/shared: zil motoru, tipler, şablonlar) monorepodan doğrudan kullanılır.
// Bütün bağımlılıklar yalnızca bu klasörün node_modules'ünden çözülür: panelin React sürümüyle karışmaz.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../packages/shared');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = { '@okulpano/shared': sharedRoot };

module.exports = config;
