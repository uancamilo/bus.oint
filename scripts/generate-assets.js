const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// PNG de 1x1 pixel negro codificado en base64
const minimalPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAE4wHZrD71swAAAABJRU5ErkJggg==';
const buffer = Buffer.from(minimalPngBase64, 'base64');

['icon.png', 'splash.png', 'adaptive-icon.png', 'favicon.png'].forEach((file) => {
  fs.writeFileSync(path.join(assetsDir, file), buffer);
});

console.log('Assets created successfully in ./assets/');

