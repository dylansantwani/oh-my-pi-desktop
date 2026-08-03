import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8')

// 1024 master → all sizes electron-builder wants
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(join(root, 'build', 'icon.png'))
await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(join(root, 'build', 'icon-256.png'))
await sharp(Buffer.from(svg)).resize(64, 64).png().toFile(join(root, 'build', 'icon-64.png'))
console.log('icons written')
