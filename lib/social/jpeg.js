/* Just enough of the JPEG format to say whether a file is one, and how big it is.
   Instagram refuses anything outside 4:5 to 1.91:1, and it is better to say so when the post
   is approved than at 8:30 on a Tuesday when it fails. */
'use strict';

function jpegSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8 || buf[2] !== 0xFF) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xFF) { i++; continue; }
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    /* Start of frame: baseline, progressive and the rest, but not DHT, JPG or DAC. */
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xDA) return null;
    i += 2 + len;
  }
  return null;
}

module.exports = { jpegSize };
